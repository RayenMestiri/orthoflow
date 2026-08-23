import type { ClientSession, QueryFilter } from 'mongoose';
import { toObjectId } from '../../common/utils/object-id.js';
import { AppointmentModel } from './appointment.model.js';
import {
  APPOINTMENT_STATUSES,
  CAPACITY_CONSUMING_APPOINTMENT_STATUSES,
  type AppointmentAttributes,
  type AppointmentRangeQuery,
  type AppointmentRecord,
  type AppointmentStatus,
  type CreateAppointmentInput,
  type UpdateAppointmentFields,
} from './appointment.types.js';

/**
 * Persistence for appointments.
 *
 * TENANCY RULE: `clinicId` is a required parameter of every method and always
 * lands in the Mongo filter. There is no lookup by appointment id alone.
 */
export class AppointmentRepository {
  async findByIdInClinic(
    appointmentId: string,
    clinicId: string,
  ): Promise<AppointmentRecord | null> {
    return AppointmentModel.findOne({
      _id: toObjectId(appointmentId, 'appointmentId'),
      clinicId: toObjectId(clinicId, 'clinicId'),
    })
      .lean<AppointmentRecord | null>()
      .exec();
  }

  /**
   * Every appointment whose time range intersects the queried window.
   *
   * The predicate is on both bounds (`startAt < end`, `endAt > start`) rather
   * than "starts inside the window", so a long visit that began before the
   * visible week still renders on Monday morning.
   */
  async listInRange(clinicId: string, query: AppointmentRangeQuery): Promise<AppointmentRecord[]> {
    const filter: QueryFilter<AppointmentAttributes> = {
      clinicId: toObjectId(clinicId, 'clinicId'),
      startAt: { $lt: query.end },
      endAt: { $gt: query.start },
    };
    if (query.status !== undefined) {
      filter.status = query.status;
    }
    if (query.patientId !== undefined) {
      filter.patientId = toObjectId(query.patientId, 'patientId');
    }

    return (
      AppointmentModel.find(filter)
        .sort({ startAt: 1 })
        // A month of solo-practice appointments is a few hundred documents;
        // 1000 is far above reality while still bounding the query.
        .limit(1000)
        .lean<AppointmentRecord[]>()
        .exec()
    );
  }

  /**
   * Does the doctor already have a live appointment overlapping [startAt, endAt)?
   *
   * Cancelled and no-show slots are free again — the check runs only against
   * statuses that still occupy the chair. `excludeId` lets a reschedule ignore
   * the appointment being moved.
   */
  async listCapacityOverlaps(
    clinicId: string,
    doctorId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ): Promise<AppointmentRecord[]> {
    const filter: QueryFilter<AppointmentAttributes> = {
      clinicId: toObjectId(clinicId, 'clinicId'),
      doctorId: toObjectId(doctorId, 'doctorId'),
      status: { $in: [...CAPACITY_CONSUMING_APPOINTMENT_STATUSES] },
      startAt: { $lt: endAt },
      endAt: { $gt: startAt },
    };
    if (excludeId !== undefined) {
      filter._id = { $ne: toObjectId(excludeId, 'appointmentId') };
    }

    return AppointmentModel.find(filter)
      .sort({ startAt: 1 })
      .limit(100)
      .lean<AppointmentRecord[]>()
      .exec();
  }

  async create(input: CreateAppointmentInput, session?: ClientSession): Promise<AppointmentRecord> {
    const [created] = await AppointmentModel.create(
      [
        {
          clinicId: toObjectId(input.clinicId, 'clinicId'),
          patientId: toObjectId(input.patientId, 'patientId'),
        treatmentId:
          input.treatmentId == null ? null : toObjectId(input.treatmentId, 'treatmentId'),
        retentionPlanId:
          input.retentionPlanId == null
            ? null
            : toObjectId(input.retentionPlanId, 'retentionPlanId'),
          doctorId: toObjectId(input.doctorId, 'doctorId'),
          appointmentTypeId: toObjectId(input.appointmentTypeId, 'appointmentTypeId'),
          startAt: input.startAt,
          endAt: input.endAt,
          durationMinutes: input.durationMinutes,
          ...(input.status === undefined ? {} : { status: input.status }),
          note: input.note ?? null,
          overbookingOverride: input.overbookingOverride ?? false,
          overbookingApprovedBy:
            input.overbookingApprovedBy == null
              ? null
              : toObjectId(input.overbookingApprovedBy, 'overbookingApprovedBy'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
        },
      ],
      { session, ordered: true },
    );

    if (!created) {
      throw new Error('Appointment creation returned no document');
    }

    return created.toObject<AppointmentRecord>();
  }

  async updateFields(
    appointmentId: string,
    clinicId: string,
    changes: UpdateAppointmentFields,
  ): Promise<AppointmentRecord | null> {
    const set: Record<string, unknown> = {
      updatedBy: toObjectId(changes.updatedBy, 'updatedBy'),
    };

    if (changes.patientId !== undefined) {
      set.patientId = toObjectId(changes.patientId, 'patientId');
    }
    if (changes.treatmentId !== undefined) {
      set.treatmentId =
        changes.treatmentId === null ? null : toObjectId(changes.treatmentId, 'treatmentId');
    }
    if (changes.retentionPlanId !== undefined) {
      set.retentionPlanId =
        changes.retentionPlanId === null
          ? null
          : toObjectId(changes.retentionPlanId, 'retentionPlanId');
    }
    if (changes.appointmentTypeId !== undefined) {
      set.appointmentTypeId = toObjectId(changes.appointmentTypeId, 'appointmentTypeId');
    }
    if (changes.startAt !== undefined) set.startAt = changes.startAt;
    if (changes.endAt !== undefined) set.endAt = changes.endAt;
    if (changes.durationMinutes !== undefined) set.durationMinutes = changes.durationMinutes;
    if (changes.note !== undefined) set.note = changes.note;
    if (changes.overbookingOverride !== undefined) {
      set.overbookingOverride = changes.overbookingOverride;
    }
    if (changes.overbookingApprovedBy !== undefined) {
      set.overbookingApprovedBy =
        changes.overbookingApprovedBy === null
          ? null
          : toObjectId(changes.overbookingApprovedBy, 'overbookingApprovedBy');
    }

    return AppointmentModel.findOneAndUpdate(
      {
        _id: toObjectId(appointmentId, 'appointmentId'),
        clinicId: toObjectId(clinicId, 'clinicId'),
      },
      { $set: set },
      { new: true, runValidators: true },
    )
      .lean<AppointmentRecord | null>()
      .exec();
  }

  /**
   * Atomically moves an appointment out of `fromStatus`.
   *
   * The current status sits in the filter, so two secretaries racing to update
   * the same visit cannot both win — the loser's `fromStatus` no longer matches
   * and they get `null` back instead of silently overwriting.
   */
  async transitionStatus(
    appointmentId: string,
    clinicId: string,
    fromStatus: AppointmentStatus,
    toStatus: AppointmentStatus,
    updatedBy: string,
    cancellation?: { reason: string | null },
    existingTimestamps?: {
      arrivedAt: Date | null;
      waitingAt: Date | null;
      treatmentStartedAt: Date | null;
    },
    session?: ClientSession,
  ): Promise<AppointmentRecord | null> {
    const set: Record<string, unknown> = {
      status: toStatus,
      updatedBy: toObjectId(updatedBy, 'updatedBy'),
    };
    if (cancellation !== undefined) {
      set.cancellationReason = cancellation.reason;
      set.cancelledAt = new Date();
      set.cancelledBy = toObjectId(updatedBy, 'cancelledBy');
    }
    const now = new Date();
    if (
      (
        [
          APPOINTMENT_STATUSES.ARRIVED,
          APPOINTMENT_STATUSES.WAITING,
          APPOINTMENT_STATUSES.IN_TREATMENT,
          APPOINTMENT_STATUSES.COMPLETED,
        ] as AppointmentStatus[]
      ).includes(toStatus)
    ) {
      if (!existingTimestamps?.arrivedAt) set.arrivedAt = now;
    }
    if (toStatus === APPOINTMENT_STATUSES.WAITING && !existingTimestamps?.waitingAt) {
      set.waitingAt = now;
    }
    if (
      (
        [APPOINTMENT_STATUSES.IN_TREATMENT, APPOINTMENT_STATUSES.COMPLETED] as AppointmentStatus[]
      ).includes(toStatus)
    ) {
      if (!existingTimestamps?.treatmentStartedAt) set.treatmentStartedAt = now;
    }
    if (toStatus === APPOINTMENT_STATUSES.COMPLETED) set.completedAt = now;
    if (toStatus === APPOINTMENT_STATUSES.NO_SHOW) {
      set.noShowAt = now;
      set.markedNoShowBy = toObjectId(updatedBy, 'markedNoShowBy');
    }

    return AppointmentModel.findOneAndUpdate(
      {
        _id: toObjectId(appointmentId, 'appointmentId'),
        clinicId: toObjectId(clinicId, 'clinicId'),
        status: fromStatus,
      },
      { $set: set },
      { new: true, runValidators: true, session },
    )
      .lean<AppointmentRecord | null>()
      .exec();
  }

  /** Bounded count used by the day header ("12 appointments today"). */
  async countInRange(clinicId: string, start: Date, end: Date): Promise<number> {
    return AppointmentModel.countDocuments({
      clinicId: toObjectId(clinicId, 'clinicId'),
      startAt: { $lt: end },
      endAt: { $gt: start },
    }).exec();
  }
}

export const appointmentRepository = new AppointmentRepository();

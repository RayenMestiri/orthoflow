import type { Types } from 'mongoose';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { BusinessRuleError, NotFoundError } from '../../common/errors/app-error.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { toPaginationParams } from '../../common/utils/pagination.js';
import type { MutationContext } from '../../common/utils/request-context.js';
import { AppointmentModel } from '../appointments/appointment.model.js';
import { APPOINTMENT_STATUSES } from '../appointments/appointment.types.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { ClinicalVisitModel } from '../clinical-visits/clinical-visit.model.js';
import { CLINICAL_VISIT_STATUSES } from '../clinical-visits/clinical-visit.types.js';
import { guardianRepository, type GuardianRepository } from '../guardians/guardian.repository.js';
import {
  patientGuardianRepository,
  type PatientGuardianRepository,
} from '../guardians/patient-guardian.repository.js';
import { AppointmentTypeModel } from '../appointment-types/appointment-type.model.js';
import { TreatmentModel } from '../treatments/treatment.model.js';
import { UserModel } from '../users/user.model.js';
import { toPatientDto } from './patient.mapper.js';
import { patientRepository, type PatientRepository } from './patient.repository.js';
import type { PatientAppointmentDto } from './patient.schema.js';
import type {
  CreatePatientInput,
  PatientDto,
  PatientListFilters,
  UpdatePatientInput,
} from './patient.types.js';

/**
 * Patient use cases.
 *
 * Note the shape of every method: `clinicId` is the first parameter and comes
 * from the request's verified tenant context. Nothing here accepts a clinic id
 * from a payload, which is what makes cross-tenant access structurally hard
 * rather than a matter of remembering to check.
 */
export class PatientService {
  constructor(
    private readonly patients: PatientRepository = patientRepository,
    private readonly audit: AuditLogService = auditLogService,
    private readonly guardians: GuardianRepository = guardianRepository,
    private readonly patientGuardians: PatientGuardianRepository = patientGuardianRepository,
  ) {}

  async list(
    clinicId: string,
    filters: PatientListFilters,
    page: { page?: number; limit?: number },
  ): Promise<{ result: PaginatedResult<PatientDto>; pagination: PaginationParams }> {
    const pagination = toPaginationParams(page);
    const { items, total } = await this.patients.listByClinic(clinicId, filters, pagination);
    const patientIds = items.map((item) => item._id);

    const [relationships, visitsByPatient] = await Promise.all([
      this.patientGuardians.listPrimaryByPatientIds(
        patientIds.map((id) => id.toString()),
        clinicId,
      ),
      this.resolveVisitsForPatients(clinicId, patientIds),
    ]);

    const guardians = await this.guardians.findManyByIdsInClinic(
      relationships.map((relationship) => relationship.guardianId.toString()),
      clinicId,
    );
    const guardiansById = new Map(guardians.map((guardian) => [guardian._id.toString(), guardian]));
    const relationshipByPatient = new Map(
      relationships.map((relationship) => [relationship.patientId.toString(), relationship]),
    );

    return {
      result: {
        items: items.map((item) => {
          const relationship = relationshipByPatient.get(item._id.toString());
          const guardian = relationship
            ? guardiansById.get(relationship.guardianId.toString())
            : undefined;
          return toPatientDto(
            item,
            relationship && guardian
              ? {
                  id: guardian._id.toString(),
                  fullName: `${guardian.firstName} ${guardian.lastName}`.trim(),
                  relationship: relationship.relationship,
                }
              : null,
            visitsByPatient.get(item._id.toString()),
          );
        }),
        total,
      },
      pagination,
    };
  }

  async getById(clinicId: string, patientId: string): Promise<PatientDto> {
    const patient = await this.patients.findByIdInClinic(patientId, clinicId);
    if (!patient) {
      // Same 404 whether the patient does not exist or belongs to another
      // clinic — the API must not confirm that an id exists elsewhere.
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }
    const visitsByPatient = await this.resolveVisitsForPatients(clinicId, [patient._id]);
    return toPatientDto(patient, null, visitsByPatient.get(patient._id.toString()));
  }

  private async resolveVisitsForPatients(
    clinicId: string,
    patientIds: Types.ObjectId[],
  ): Promise<
    Map<
      string,
      {
        lastVisit: PatientDto['lastVisit'];
        nextVisit: PatientDto['nextVisit'];
      }
    >
  > {
    const visitsByPatient = new Map<
      string,
      {
        lastVisit: PatientDto['lastVisit'];
        nextVisit: PatientDto['nextVisit'];
      }
    >();

    if (patientIds.length === 0) {
      return visitsByPatient;
    }

    for (const id of patientIds) {
      visitsByPatient.set(id.toString(), { lastVisit: null, nextVisit: null });
    }

    const now = new Date();
    const clinicOid = toObjectId(clinicId, 'clinicId');

    const [pastAppointments, futureAppointments, clinicalVisits] = await Promise.all([
      // Past or completed appointments (strictly startAt <= now)
      AppointmentModel.find({
        clinicId: clinicOid,
        patientId: { $in: patientIds },
        startAt: { $lte: now },
        status: {
          $nin: [APPOINTMENT_STATUSES.CANCELLED, APPOINTMENT_STATUSES.NO_SHOW],
        },
      })
        .sort({ startAt: -1 })
        .lean()
        .exec(),

      // Future upcoming appointments (strictly startAt > now, not cancelled or no-show)
      AppointmentModel.find({
        clinicId: clinicOid,
        patientId: { $in: patientIds },
        startAt: { $gt: now },
        status: {
          $nin: [APPOINTMENT_STATUSES.CANCELLED, APPOINTMENT_STATUSES.NO_SHOW],
        },
      })
        .sort({ startAt: 1 })
        .lean()
        .exec(),

      // Completed clinical visits
      ClinicalVisitModel.find({
        clinicId: clinicOid,
        patientId: { $in: patientIds },
        status: CLINICAL_VISIT_STATUSES.COMPLETED,
      })
        .sort({ completedAt: -1, startedAt: -1 })
        .lean()
        .exec(),
    ]);

    // Map past appointments by patient
    for (const appt of pastAppointments) {
      const pid = appt.patientId.toString();
      const existing = visitsByPatient.get(pid);
      if (existing && !existing.lastVisit) {
        const d = appt.completedAt ?? appt.startAt;
        existing.lastVisit = { date: d.toISOString(), status: appt.status };
      }
    }

    // Compare with completed clinical visits for lastVisit
    for (const visit of clinicalVisits) {
      const pid = visit.patientId.toString();
      const existing = visitsByPatient.get(pid);
      if (existing) {
        const visitDate = visit.completedAt ?? visit.startedAt;
        if (
          !existing.lastVisit ||
          new Date(existing.lastVisit.date).getTime() < visitDate.getTime()
        ) {
          existing.lastVisit = { date: visitDate.toISOString(), status: 'COMPLETED' };
        }
      }
    }

    // Map future appointments for nextVisit
    for (const appt of futureAppointments) {
      const pid = appt.patientId.toString();
      const existing = visitsByPatient.get(pid);
      if (existing && !existing.nextVisit) {
        existing.nextVisit = {
          date: appt.startAt.toISOString(),
          status: appt.status,
          isRecommended: false,
        };
      }
    }

    // If no future appointment is booked, fallback to recommended visit date if in future
    for (const visit of clinicalVisits) {
      const pid = visit.patientId.toString();
      const existing = visitsByPatient.get(pid);
      if (
        existing &&
        !existing.nextVisit &&
        visit.nextVisitRecommendedAt &&
        visit.nextVisitRecommendedAt >= now
      ) {
        existing.nextVisit = {
          date: visit.nextVisitRecommendedAt.toISOString(),
          isRecommended: true,
        };
      }
    }

    return visitsByPatient;
  }

  async create(
    clinicId: string,
    input: Omit<CreatePatientInput, 'clinicId' | 'createdBy'>,
    context: MutationContext,
  ): Promise<PatientDto> {
    const patient = await this.patients.create({
      ...input,
      clinicId,
      createdBy: context.actorUserId,
    });

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.PATIENT_CREATED,
      resourceType: AUDIT_RESOURCE_TYPES.PATIENT,
      resourceId: patient._id.toString(),
      metadata: {},
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return toPatientDto(patient);
  }

  async update(
    clinicId: string,
    patientId: string,
    changes: UpdatePatientInput,
    context: MutationContext,
  ): Promise<PatientDto> {
    const updated = await this.patients.update(patientId, clinicId, changes);
    if (!updated) {
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.PATIENT_UPDATED,
      resourceType: AUDIT_RESOURCE_TYPES.PATIENT,
      resourceId: patientId,
      // Field names only — the audit trail is not a shadow copy of patient data.
      metadata: { fields: Object.keys(changes) },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return toPatientDto(updated);
  }

  /**
   * Archives a patient. There is no delete endpoint, by design: a patient record
   * is the anchor for treatments and cash records that must remain auditable.
   */
  async archive(
    clinicId: string,
    patientId: string,
    context: MutationContext,
  ): Promise<PatientDto> {
    const archived = await this.patients.archive(patientId, clinicId, context.actorUserId);

    if (!archived) {
      const existing = await this.patients.findByIdInClinic(patientId, clinicId);
      if (!existing) {
        throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
      }
      throw new BusinessRuleError('This patient is already archived', {
        code: ERROR_CODES.PATIENT_ALREADY_ARCHIVED,
      });
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.PATIENT_ARCHIVED,
      resourceType: AUDIT_RESOURCE_TYPES.PATIENT,
      resourceId: patientId,
      metadata: {},
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return toPatientDto(archived);
  }

  async restore(
    clinicId: string,
    patientId: string,
    context: MutationContext,
  ): Promise<PatientDto> {
    const restored = await this.patients.restore(patientId, clinicId);
    if (!restored) {
      throw new NotFoundError('No archived patient found with this id', {
        code: ERROR_CODES.PATIENT_NOT_FOUND,
      });
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.PATIENT_RESTORED,
      resourceType: AUDIT_RESOURCE_TYPES.PATIENT,
      resourceId: patientId,
      metadata: {},
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return toPatientDto(restored);
  }

  async listAppointments(clinicId: string, patientId: string): Promise<PatientAppointmentDto[]> {
    const patient = await this.patients.findByIdInClinic(patientId, clinicId);
    if (!patient) {
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }

    const clinicOid = toObjectId(clinicId, 'clinicId');
    const patientOid = toObjectId(patientId, 'patientId');

    const appointments = await AppointmentModel.find({
      clinicId: clinicOid,
      patientId: patientOid,
    })
      .sort({ startAt: -1 })
      .limit(300)
      .lean()
      .exec();

    if (appointments.length === 0) {
      return [];
    }

    const appointmentTypeIds = [
      ...new Set(appointments.map((a) => a.appointmentTypeId.toString())),
    ];
    const doctorIds = [...new Set(appointments.map((a) => a.doctorId.toString()))];
    const treatmentIds = [
      ...new Set(
        appointments.map((a) => a.treatmentId?.toString()).filter((id): id is string => !!id),
      ),
    ];
    const appointmentOids = appointments.map((a) => a._id);

    const [types, doctors, treatments, visits] = await Promise.all([
      AppointmentTypeModel.find({
        clinicId: clinicOid,
        _id: { $in: appointmentTypeIds.map((id) => toObjectId(id, 'typeId')) },
      })
        .lean()
        .exec(),
      UserModel.find({ _id: { $in: doctorIds.map((id) => toObjectId(id, 'doctorId')) } })
        .lean()
        .exec(),
      TreatmentModel.find({
        clinicId: clinicOid,
        _id: { $in: treatmentIds.map((id) => toObjectId(id, 'treatmentId')) },
      })
        .lean()
        .exec(),
      ClinicalVisitModel.find({
        clinicId: clinicOid,
        appointmentId: { $in: appointmentOids },
      })
        .lean()
        .exec(),
    ]);

    const typesMap = new Map(types.map((t) => [t._id.toString(), t]));
    const doctorsMap = new Map(
      doctors.map((d) => [d._id.toString(), `${d.firstName} ${d.lastName}`.trim()]),
    );
    const treatmentsMap = new Map(
      treatments.map((t) => {
        const label =
          t.type === 'OTHER'
            ? t.customTypeLabel ?? 'Other treatment'
            : t.type.toLowerCase().replaceAll('_', ' ').replace(/^./, (l) => l.toUpperCase());
        return [t._id.toString(), { id: t._id.toString(), label, status: t.status }];
      }),
    );

    const visitUserIds = [...new Set(visits.map((v) => v.createdBy.toString()))];
    const visitUsers = await UserModel.find({
      _id: { $in: visitUserIds.map((id) => toObjectId(id, 'userId')) },
    })
      .lean()
      .exec();
    const visitUsersMap = new Map(
      visitUsers.map((u) => [u._id.toString(), `${u.firstName} ${u.lastName}`.trim()]),
    );

    const visitsByAppointmentId = new Map(
      visits.map((v) => [
        v.appointmentId.toString(),
        {
          id: v._id.toString(),
          status: v.status,
          reasonCode: v.reasonCode,
          reasonOther: v.reasonOther,
          procedures: v.procedures,
          observations: v.observations,
          nextStepNote: v.nextStepNote,
          completedAt: v.completedAt ? v.completedAt.toISOString() : null,
          clinicianName: visitUsersMap.get(v.createdBy.toString()) ?? 'Clinician',
        },
      ]),
    );

    return appointments.map((appt) => {
      const type = typesMap.get(appt.appointmentTypeId.toString());
      const doctorName = doctorsMap.get(appt.doctorId.toString()) ?? 'Doctor';
      const treatment = appt.treatmentId
        ? treatmentsMap.get(appt.treatmentId.toString()) ?? null
        : null;
      const clinicalVisit = visitsByAppointmentId.get(appt._id.toString()) ?? null;

      return {
        id: appt._id.toString(),
        startAt: appt.startAt.toISOString(),
        endAt: appt.endAt.toISOString(),
        durationMinutes: appt.durationMinutes,
        status: appt.status,
        note: appt.note,
        cancellationReason: appt.cancellationReason,
        treatmentStartedAt: appt.treatmentStartedAt ? appt.treatmentStartedAt.toISOString() : null,
        completedAt: appt.completedAt ? appt.completedAt.toISOString() : null,
        appointmentType: {
          id: appt.appointmentTypeId.toString(),
          name: type?.name ?? 'Appointment',
          color: type?.color ?? null,
          durationMinutes: type?.durationMinutes ?? null,
        },
        doctor: {
          id: appt.doctorId.toString(),
          name: doctorName,
        },
        treatment,
        clinicalVisit,
      };
    });
  }
}

export const patientService = new PatientService();

import { ERROR_CODES } from '../../common/constants/error-codes.js';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/app-error.js';
import { clockToMinutes, toWallClock } from '../../common/utils/clinic-time.js';
import type { MutationContext } from '../../common/utils/request-context.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import {
  appointmentTypeRepository,
  type AppointmentTypeRepository,
} from '../appointment-types/appointment-type.repository.js';
import {
  appointmentTypeService,
  type AppointmentTypeService,
} from '../appointment-types/appointment-type.service.js';
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import {
  DEFAULT_CLINIC_SETTINGS,
  type ClinicSchedulingSettings,
  type Weekday,
} from '../clinics/clinic-settings.types.js';
import type { ClinicRecord } from '../clinics/clinic.types.js';
import {
  membershipRepository,
  type MembershipRepository,
} from '../memberships/membership.repository.js';
import { patientRepository, type PatientRepository } from '../patients/patient.repository.js';
import { PATIENT_STATUSES } from '../patients/patient.types.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import { toAppointmentDto } from './appointment.mapper.js';
import { appointmentRepository, type AppointmentRepository } from './appointment.repository.js';
import {
  capacityInfoForRecord,
  evaluateProposedCapacity,
  type CapacityEvaluation,
} from './scheduling-capacity.js';
import {
  APPOINTMENT_STATUSES,
  canTransition,
  isClosedStatus,
  type AppointmentDto,
  type AppointmentActivityDto,
  type AppointmentRecord,
  type AppointmentStatus,
} from './appointment.types.js';

export interface CreateAppointmentCommand {
  patientId: string;
  appointmentTypeId: string;
  /** UTC instant. */
  startAt: Date;
  /** Optional override; defaults to the appointment type's duration. */
  durationMinutes?: number;
  note?: string | null;
  allowOverbooking?: boolean;
}

export interface UpdateAppointmentCommand {
  patientId?: string;
  appointmentTypeId?: string;
  startAt?: Date;
  durationMinutes?: number;
  note?: string | null;
  allowOverbooking?: boolean;
}

/** The visible calendar window may not exceed ~2 months per request. */
const MAX_RANGE_DAYS = 62;
const MINUTE_MS = 60_000;
const WEEKDAY_BY_NUMBER: readonly Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/** Drops seconds and milliseconds — the diary works in whole minutes. */
function truncateToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS);
}

/**
 * Appointment use cases.
 *
 * Two rules shape everything here:
 *  1. `clinicId` always comes from the verified tenant context, and every
 *     repository call carries it.
 *  2. MVP — ONE CLINIC = ONE OWNER-DOCTOR: `doctorId` is resolved from the
 *     clinic's ownership membership on the server. No client value is trusted.
 */
export class AppointmentService {
  constructor(
    private readonly appointments: AppointmentRepository = appointmentRepository,
    private readonly types: AppointmentTypeRepository = appointmentTypeRepository,
    private readonly typeService: AppointmentTypeService = appointmentTypeService,
    private readonly patients: PatientRepository = patientRepository,
    private readonly clinics: ClinicRepository = clinicRepository,
    private readonly memberships: MembershipRepository = membershipRepository,
    private readonly audit: AuditLogService = auditLogService,
    private readonly users: UserRepository = userRepository,
  ) {}

  // --- reads ---------------------------------------------------------------

  async listInRange(
    clinicId: string,
    query: { start: Date; end: Date; status?: AppointmentStatus; patientId?: string },
  ): Promise<AppointmentDto[]> {
    if (query.end.getTime() <= query.start.getTime()) {
      throw new ValidationError('end must be after start', {
        code: ERROR_CODES.APPOINTMENT_INVALID_TIME_RANGE,
      });
    }
    if (query.end.getTime() - query.start.getTime() > MAX_RANGE_DAYS * 24 * 60 * MINUTE_MS) {
      throw new ValidationError(`Range must not exceed ${MAX_RANGE_DAYS} days`, {
        code: ERROR_CODES.APPOINTMENT_INVALID_TIME_RANGE,
      });
    }

    const [records, clinic] = await Promise.all([
      this.appointments.listInRange(clinicId, query),
      this.requireClinic(clinicId),
    ]);
    return this.joinDetails(clinicId, records, this.capacityFor(clinic));
  }

  async getById(clinicId: string, appointmentId: string): Promise<AppointmentDto> {
    const record = await this.requireAppointment(clinicId, appointmentId);
    const clinic = await this.requireClinic(clinicId);
    const overlaps = await this.appointments.listCapacityOverlaps(
      clinicId,
      record.doctorId.toString(),
      record.startAt,
      record.endAt,
    );
    const [dto] = await this.joinDetails(clinicId, [record, ...overlaps], this.capacityFor(clinic));
    if (!dto) {
      throw new NotFoundError('Appointment not found', {
        code: ERROR_CODES.APPOINTMENT_NOT_FOUND,
      });
    }
    return dto;
  }

  async getActivity(
    clinicId: string,
    appointmentId: string,
    page: { page?: number; limit?: number },
  ) {
    await this.requireAppointment(clinicId, appointmentId);
    const { result, pagination } = await this.audit.listForClinic(
      clinicId,
      { resourceType: AUDIT_RESOURCE_TYPES.APPOINTMENT, resourceId: appointmentId },
      page,
    );
    const actorIds = [
      ...new Set(result.items.flatMap((item) => (item.actorUserId ? [item.actorUserId] : []))),
    ];
    const actors = await this.users.findManyByIds(actorIds);
    const actorNames = new Map(
      actors.map((actor) => [actor._id.toString(), `${actor.firstName} ${actor.lastName}`.trim()]),
    );
    const items: AppointmentActivityDto[] = result.items.map((item) => ({
      id: item.id,
      action: item.action,
      actorUserId: item.actorUserId,
      actorName: item.actorUserId
        ? (actorNames.get(item.actorUserId) ?? 'Clinic team member')
        : 'System',
      metadata: item.metadata,
      createdAt: item.createdAt,
    }));
    return { result: { items, total: result.total }, pagination };
  }

  // --- create --------------------------------------------------------------

  async create(
    clinicId: string,
    command: CreateAppointmentCommand,
    context: MutationContext,
  ): Promise<AppointmentDto> {
    const clinic = await this.requireClinic(clinicId);
    const doctorId = await this.resolveDoctorId(clinicId);
    const patient = await this.requireBookablePatient(clinicId, command.patientId);
    const appointmentType = await this.typeService.requireBookable(
      clinicId,
      command.appointmentTypeId,
    );

    const startAt = truncateToMinute(command.startAt);
    const durationMinutes =
      command.durationMinutes ??
      appointmentType.durationMinutes ??
      this.schedulingFor(clinic).defaultAppointmentDurationMinutes;
    const endAt = new Date(startAt.getTime() + durationMinutes * MINUTE_MS);

    this.assertWithinWorkingHours(clinic, startAt, endAt);
    const capacity = await this.assertCapacity(
      clinicId,
      doctorId,
      startAt,
      endAt,
      this.capacityFor(clinic),
      command.allowOverbooking ?? false,
      this.schedulingFor(clinic).allowOwnerOverbooking,
      context.actorUserId,
    );

    const record = await this.appointments.create({
      clinicId,
      patientId: patient._id.toString(),
      doctorId,
      appointmentTypeId: appointmentType._id.toString(),
      startAt,
      endAt,
      durationMinutes,
      note: command.note ?? null,
      overbookingOverride: capacity.requiresConfirmation,
      overbookingApprovedBy: capacity.requiresConfirmation ? context.actorUserId : null,
      createdBy: context.actorUserId,
    });

    if (capacity.requiresConfirmation) {
      await this.recordOverbooking(clinicId, record, capacity, context);
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.APPOINTMENT_CREATED,
      resourceType: AUDIT_RESOURCE_TYPES.APPOINTMENT,
      resourceId: record._id.toString(),
      metadata: {
        patientId: patient._id.toString(),
        appointmentTypeId: appointmentType._id.toString(),
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const visibleRecords = await this.appointments.listCapacityOverlaps(
      clinicId,
      doctorId,
      startAt,
      endAt,
    );
    const [dto] = await this.joinDetails(
      clinicId,
      [record, ...visibleRecords],
      this.capacityFor(clinic),
    );
    return dto as AppointmentDto;
  }

  // --- update / reschedule -------------------------------------------------

  async update(
    clinicId: string,
    appointmentId: string,
    command: UpdateAppointmentCommand,
    context: MutationContext,
  ): Promise<AppointmentDto> {
    const existing = await this.requireAppointment(clinicId, appointmentId);

    if (isClosedStatus(existing.status)) {
      throw new BusinessRuleError('A completed, missed or cancelled appointment cannot be edited', {
        code: ERROR_CODES.APPOINTMENT_ALREADY_CLOSED,
      });
    }

    if (command.patientId !== undefined && command.patientId !== existing.patientId.toString()) {
      await this.requireBookablePatient(clinicId, command.patientId);
    }

    const typeChanged =
      command.appointmentTypeId !== undefined &&
      command.appointmentTypeId !== existing.appointmentTypeId.toString();
    const newType = typeChanged
      ? await this.typeService.requireBookable(clinicId, command.appointmentTypeId as string)
      : null;

    const startAt =
      command.startAt !== undefined ? truncateToMinute(command.startAt) : existing.startAt;
    // Priority: explicit duration → new type's default → whatever it was.
    const durationMinutes =
      command.durationMinutes ?? newType?.durationMinutes ?? existing.durationMinutes;
    const endAt = new Date(startAt.getTime() + durationMinutes * MINUTE_MS);

    const timeChanged =
      startAt.getTime() !== existing.startAt.getTime() ||
      endAt.getTime() !== existing.endAt.getTime();

    let clinic: ClinicRecord | null = null;
    let capacity: CapacityEvaluation | null = null;
    if (timeChanged) {
      clinic = await this.requireClinic(clinicId);
      this.assertWithinWorkingHours(clinic, startAt, endAt);
      capacity = await this.assertCapacity(
        clinicId,
        existing.doctorId.toString(),
        startAt,
        endAt,
        this.capacityFor(clinic),
        command.allowOverbooking ?? false,
        this.schedulingFor(clinic).allowOwnerOverbooking,
        context.actorUserId,
        appointmentId,
      );
    }

    const updated = await this.appointments.updateFields(appointmentId, clinicId, {
      ...(command.patientId === undefined ? {} : { patientId: command.patientId }),
      ...(command.appointmentTypeId === undefined
        ? {}
        : { appointmentTypeId: command.appointmentTypeId }),
      startAt,
      endAt,
      durationMinutes,
      ...(command.note === undefined ? {} : { note: command.note }),
      ...(timeChanged
        ? {
            overbookingOverride: capacity?.requiresConfirmation ?? false,
            overbookingApprovedBy: capacity?.requiresConfirmation ? context.actorUserId : null,
          }
        : {}),
      updatedBy: context.actorUserId,
    });

    if (!updated) {
      throw new NotFoundError('Appointment not found', {
        code: ERROR_CODES.APPOINTMENT_NOT_FOUND,
      });
    }

    if (capacity?.requiresConfirmation) {
      await this.recordOverbooking(clinicId, updated, capacity, context);
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: timeChanged
        ? AUDIT_ACTIONS.APPOINTMENT_RESCHEDULED
        : AUDIT_ACTIONS.APPOINTMENT_UPDATED,
      resourceType: AUDIT_RESOURCE_TYPES.APPOINTMENT,
      resourceId: appointmentId,
      metadata: timeChanged
        ? {
            from: { startAt: existing.startAt.toISOString(), endAt: existing.endAt.toISOString() },
            to: { startAt: startAt.toISOString(), endAt: endAt.toISOString() },
          }
        : { fields: Object.keys(command) },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const durationChanged = durationMinutes !== existing.durationMinutes;
    if (durationChanged) {
      await this.audit.record({
        clinicId,
        actorUserId: context.actorUserId,
        action: AUDIT_ACTIONS.APPOINTMENT_DURATION_CHANGED,
        resourceType: AUDIT_RESOURCE_TYPES.APPOINTMENT,
        resourceId: appointmentId,
        metadata: { from: existing.durationMinutes, to: durationMinutes },
        ip: context.ip,
        userAgent: context.userAgent,
      });
    }

    const resolvedClinic = clinic ?? (await this.requireClinic(clinicId));
    const overlapRecords = await this.appointments.listCapacityOverlaps(
      clinicId,
      updated.doctorId.toString(),
      updated.startAt,
      updated.endAt,
    );
    const [dto] = await this.joinDetails(
      clinicId,
      [updated, ...overlapRecords],
      this.capacityFor(resolvedClinic),
    );
    return dto as AppointmentDto;
  }

  // --- status --------------------------------------------------------------

  async changeStatus(
    clinicId: string,
    appointmentId: string,
    toStatus: Exclude<AppointmentStatus, 'CANCELLED'>,
    context: MutationContext,
  ): Promise<AppointmentDto> {
    const existing = await this.requireAppointment(clinicId, appointmentId);
    this.assertTransition(existing.status, toStatus);

    const updated = await this.appointments.transitionStatus(
      appointmentId,
      clinicId,
      existing.status,
      toStatus,
      context.actorUserId,
      undefined,
      {
        arrivedAt: existing.arrivedAt,
        treatmentStartedAt: existing.treatmentStartedAt,
      },
    );

    if (!updated) {
      // Someone else changed the status between our read and our write.
      throw new ConflictError('The appointment status changed — reload and try again', {
        code: ERROR_CODES.APPOINTMENT_INVALID_STATUS_TRANSITION,
      });
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action:
        toStatus === APPOINTMENT_STATUSES.NO_SHOW
          ? AUDIT_ACTIONS.APPOINTMENT_NO_SHOW
          : AUDIT_ACTIONS.APPOINTMENT_STATUS_CHANGED,
      resourceType: AUDIT_RESOURCE_TYPES.APPOINTMENT,
      resourceId: appointmentId,
      metadata: { from: existing.status, to: toStatus },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.joinOneWithCapacity(clinicId, updated);
  }

  /**
   * Cancel is not delete: the appointment stays in the diary's history with
   * who cancelled it, when, and why.
   */
  async cancel(
    clinicId: string,
    appointmentId: string,
    reason: string | null,
    context: MutationContext,
  ): Promise<AppointmentDto> {
    const existing = await this.requireAppointment(clinicId, appointmentId);
    this.assertTransition(existing.status, APPOINTMENT_STATUSES.CANCELLED);

    const updated = await this.appointments.transitionStatus(
      appointmentId,
      clinicId,
      existing.status,
      APPOINTMENT_STATUSES.CANCELLED,
      context.actorUserId,
      { reason },
    );

    if (!updated) {
      throw new ConflictError('The appointment status changed — reload and try again', {
        code: ERROR_CODES.APPOINTMENT_INVALID_STATUS_TRANSITION,
      });
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.APPOINTMENT_CANCELLED,
      resourceType: AUDIT_RESOURCE_TYPES.APPOINTMENT,
      resourceId: appointmentId,
      metadata: { from: existing.status, hasReason: reason !== null },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.joinOneWithCapacity(clinicId, updated);
  }

  // --- internals -----------------------------------------------------------

  private async requireAppointment(
    clinicId: string,
    appointmentId: string,
  ): Promise<AppointmentRecord> {
    const record = await this.appointments.findByIdInClinic(appointmentId, clinicId);
    if (!record) {
      // Same 404 whether it does not exist or belongs to another clinic.
      throw new NotFoundError('Appointment not found', {
        code: ERROR_CODES.APPOINTMENT_NOT_FOUND,
      });
    }
    return record;
  }

  private async requireClinic(clinicId: string): Promise<ClinicRecord> {
    const clinic = await this.clinics.findById(clinicId);
    if (!clinic) {
      throw new NotFoundError('Clinic not found', { code: ERROR_CODES.CLINIC_NOT_FOUND });
    }
    return clinic;
  }

  /** MVP doctor resolution: the clinic's active owner. Never a client value. */
  private async resolveDoctorId(clinicId: string): Promise<string> {
    const owner = await this.memberships.findActiveOwner(clinicId);
    if (!owner) {
      throw new BusinessRuleError('This clinic has no active owner-doctor to schedule for', {
        code: ERROR_CODES.CLINIC_HAS_NO_DOCTOR,
      });
    }
    return owner.userId.toString();
  }

  private async requireBookablePatient(clinicId: string, patientId: string) {
    const patient = await this.patients.findByIdInClinic(patientId, clinicId);
    if (!patient) {
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }
    if (patient.status === PATIENT_STATUSES.ARCHIVED) {
      throw new BusinessRuleError('An archived patient cannot be scheduled — restore them first', {
        code: ERROR_CODES.PATIENT_ALREADY_ARCHIVED,
      });
    }
    return patient;
  }

  /**
   * The visit must sit inside one working day of the clinic, in the clinic's
   * own timezone. Instants are UTC; `toWallClock` does the tz conversion.
   */
  private assertWithinWorkingHours(clinic: ClinicRecord, startAt: Date, endAt: Date): void {
    if (endAt.getTime() <= startAt.getTime()) {
      throw new ValidationError('End time must be after start time', {
        code: ERROR_CODES.APPOINTMENT_INVALID_TIME_RANGE,
      });
    }

    const settings = clinic.settings ?? DEFAULT_CLINIC_SETTINGS;
    const scheduling = this.schedulingFor(clinic);
    const start = toWallClock(startAt, clinic.timezone);
    // Last occupied minute, so an appointment ending exactly at closing time
    // (or local midnight) still counts as the same day.
    const lastMinute = toWallClock(new Date(endAt.getTime() - MINUTE_MS), clinic.timezone);

    if (start.weekday !== lastMinute.weekday) {
      throw new BusinessRuleError('An appointment cannot span two clinic days', {
        code: ERROR_CODES.APPOINTMENT_OUTSIDE_WORKING_HOURS,
      });
    }

    if (start.minutesOfDay % scheduling.slotIntervalMinutes !== 0) {
      throw new BusinessRuleError(
        `Appointment starts must align to ${scheduling.slotIntervalMinutes}-minute slots`,
        {
          code: ERROR_CODES.APPOINTMENT_INVALID_TIME_RANGE,
          details: { slotIntervalMinutes: scheduling.slotIntervalMinutes },
        },
      );
    }

    const weekday = WEEKDAY_BY_NUMBER[start.weekday];
    const workingHours = settings.workingHours ?? DEFAULT_CLINIC_SETTINGS.workingHours;
    const periods = weekday ? workingHours[weekday] : [];
    if (periods.length === 0) {
      throw new BusinessRuleError('The clinic is closed on this day', {
        code: ERROR_CODES.APPOINTMENT_OUTSIDE_WORKING_HOURS,
        details: { weekday: start.weekday },
      });
    }

    const endMinutes = lastMinute.minutesOfDay + 1;
    const matchingPeriod = periods.find(
      (period) =>
        start.minutesOfDay >= clockToMinutes(period.start) &&
        endMinutes <= clockToMinutes(period.end),
    );

    if (!matchingPeriod) {
      throw new BusinessRuleError(
        'The appointment must fit entirely within one clinic working period',
        {
          code: ERROR_CODES.APPOINTMENT_OUTSIDE_WORKING_HOURS,
          details: { periods },
        },
      );
    }
  }

  /** Applies the clinic's soft concurrent-capacity policy to live overlaps. */
  private async assertCapacity(
    clinicId: string,
    doctorId: string,
    startAt: Date,
    endAt: Date,
    recommendedCapacity: number,
    allowOverbooking: boolean,
    ownerOverbookingAllowed: boolean,
    actorUserId: string,
    excludeId?: string,
  ): Promise<CapacityEvaluation> {
    const overlaps = await this.appointments.listCapacityOverlaps(
      clinicId,
      doctorId,
      startAt,
      endAt,
      excludeId,
    );

    const evaluation = evaluateProposedCapacity(overlaps, startAt, endAt, recommendedCapacity);
    if (evaluation.requiresConfirmation && !allowOverbooking) {
      const patientIds = [...new Set(overlaps.map((record) => record.patientId.toString()))];
      const patients = await this.patients.findManyByIdsInClinic(patientIds, clinicId);
      const names = new Map(
        patients.map((patient) => [
          patient._id.toString(),
          `${patient.firstName} ${patient.lastName}`.trim(),
        ]),
      );
      throw new BusinessRuleError('This time is already at the clinic’s recommended capacity', {
        code: ERROR_CODES.SLOT_CAPACITY_EXCEEDED,
        details: {
          requiresConfirmation: true,
          recommendedCapacity,
          concurrentAppointments: evaluation.existingPeak,
          resultingAppointments: evaluation.resultingPeak,
          state: evaluation.state,
          overrideAllowed: ownerOverbookingAllowed && actorUserId === doctorId,
          overlappingAppointments: overlaps.map((record) => ({
            id: record._id.toString(),
            patientName: names.get(record.patientId.toString()) ?? 'Patient',
            startAt: record.startAt.toISOString(),
            endAt: record.endAt.toISOString(),
          })),
        },
      });
    }
    if (evaluation.requiresConfirmation && !ownerOverbookingAllowed) {
      throw new BusinessRuleError('Clinic policy does not allow intentional overbooking', {
        code: ERROR_CODES.APPOINTMENT_OVERBOOKING_NOT_ALLOWED,
      });
    }
    if (evaluation.requiresConfirmation && actorUserId !== doctorId) {
      throw new ForbiddenError('Only the clinic owner can approve an overbooking', {
        code: ERROR_CODES.APPOINTMENT_OVERBOOKING_NOT_ALLOWED,
      });
    }
    return evaluation;
  }

  private assertTransition(from: AppointmentStatus, to: AppointmentStatus): void {
    if (from === to) {
      throw new BusinessRuleError(`The appointment is already ${to.toLowerCase()}`, {
        code: ERROR_CODES.APPOINTMENT_INVALID_STATUS_TRANSITION,
      });
    }
    if (!canTransition(from, to)) {
      throw new BusinessRuleError(`Cannot move an appointment from ${from} to ${to}`, {
        code: ERROR_CODES.APPOINTMENT_INVALID_STATUS_TRANSITION,
        details: { from, to },
      });
    }
  }

  /** Joins patient and type summaries onto records, two bounded batch reads. */
  private async joinDetails(
    clinicId: string,
    records: AppointmentRecord[],
    recommendedCapacity = DEFAULT_CLINIC_SETTINGS.scheduling.defaultConcurrentCapacity,
  ): Promise<AppointmentDto[]> {
    if (records.length === 0) {
      return [];
    }

    const uniqueRecords = [
      ...new Map(records.map((record) => [record._id.toString(), record])).values(),
    ];

    const patientIds = [...new Set(uniqueRecords.map((record) => record.patientId.toString()))];
    const typeIds = [
      ...new Set(uniqueRecords.map((record) => record.appointmentTypeId.toString())),
    ];

    const [patients, types] = await Promise.all([
      this.patients.findManyByIdsInClinic(patientIds, clinicId),
      this.types.findManyByIdsInClinic(typeIds, clinicId),
    ]);

    const patientsById = new Map(patients.map((patient) => [patient._id.toString(), patient]));
    const typesById = new Map(types.map((type) => [type._id.toString(), type]));

    return uniqueRecords.map((record) =>
      toAppointmentDto(
        record,
        patientsById.get(record.patientId.toString()),
        typesById.get(record.appointmentTypeId.toString()),
        capacityInfoForRecord(record, uniqueRecords, recommendedCapacity),
      ),
    );
  }

  private capacityFor(clinic: ClinicRecord): number {
    return this.schedulingFor(clinic).defaultConcurrentCapacity;
  }

  private schedulingFor(clinic: ClinicRecord): ClinicSchedulingSettings {
    return clinic.settings?.scheduling ?? DEFAULT_CLINIC_SETTINGS.scheduling;
  }

  private async joinOneWithCapacity(
    clinicId: string,
    record: AppointmentRecord,
  ): Promise<AppointmentDto> {
    const [clinic, overlaps] = await Promise.all([
      this.requireClinic(clinicId),
      this.appointments.listCapacityOverlaps(
        clinicId,
        record.doctorId.toString(),
        record.startAt,
        record.endAt,
      ),
    ]);
    const [dto] = await this.joinDetails(clinicId, [record, ...overlaps], this.capacityFor(clinic));
    return dto as AppointmentDto;
  }

  private async recordOverbooking(
    clinicId: string,
    record: AppointmentRecord,
    capacity: CapacityEvaluation,
    context: MutationContext,
  ): Promise<void> {
    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.APPOINTMENT_OVERBOOKED,
      resourceType: AUDIT_RESOURCE_TYPES.APPOINTMENT,
      resourceId: record._id.toString(),
      metadata: {
        startAt: record.startAt.toISOString(),
        endAt: record.endAt.toISOString(),
        recommendedCapacity: capacity.recommendedCapacity,
        resultingAppointments: capacity.resultingPeak,
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}

export const appointmentService = new AppointmentService();

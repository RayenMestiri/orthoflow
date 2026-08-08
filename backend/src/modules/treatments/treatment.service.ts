import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toPaginationParams } from '../../common/utils/pagination.js';
import type { MutationContext } from '../../common/utils/request-context.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  type AuditAction,
} from '../audit-logs/audit-log.types.js';
import {
  membershipRepository,
  type MembershipRepository,
} from '../memberships/membership.repository.js';
import { patientRepository, type PatientRepository } from '../patients/patient.repository.js';
import { PATIENT_STATUSES } from '../patients/patient.types.js';
import {
  toTreatmentDto,
  toTreatmentProgressDto,
  toTreatmentWithProgressDto,
} from './treatment.mapper.js';
import { treatmentRepository, type TreatmentRepository } from './treatment.repository.js';
import {
  canTransitionTreatment,
  isClosedTreatmentStatus,
  TREATMENT_EVENT_TYPES,
  TREATMENT_STATUSES,
  type TreatmentDto,
  type TreatmentEventType,
  type TreatmentProgressDto,
  type TreatmentRecord,
  type TreatmentStatus,
  type TreatmentWithProgressDto,
} from './treatment.types.js';

/** Audit action for each status the treatment moves into. */
const STATUS_AUDIT_ACTIONS: Record<TreatmentStatus, AuditAction> = {
  [TREATMENT_STATUSES.PLANNED]: AUDIT_ACTIONS.TREATMENT_CREATED,
  [TREATMENT_STATUSES.ACTIVE]: AUDIT_ACTIONS.TREATMENT_STARTED,
  [TREATMENT_STATUSES.PAUSED]: AUDIT_ACTIONS.TREATMENT_PAUSED,
  [TREATMENT_STATUSES.COMPLETED]: AUDIT_ACTIONS.TREATMENT_COMPLETED,
  [TREATMENT_STATUSES.CANCELLED]: AUDIT_ACTIONS.TREATMENT_CANCELLED,
};

/** Timeline entry the state machine writes for each move, so the diary is complete. */
const STATUS_EVENT_TYPES: Record<TreatmentStatus, TreatmentEventType | null> = {
  [TREATMENT_STATUSES.PLANNED]: null,
  [TREATMENT_STATUSES.ACTIVE]: TREATMENT_EVENT_TYPES.STARTED,
  [TREATMENT_STATUSES.PAUSED]: TREATMENT_EVENT_TYPES.PAUSED,
  [TREATMENT_STATUSES.COMPLETED]: TREATMENT_EVENT_TYPES.COMPLETED,
  [TREATMENT_STATUSES.CANCELLED]: TREATMENT_EVENT_TYPES.CANCELLED,
};

/** Midnight UTC for a `YYYY-MM-DD` string, matching how patient birth dates are stored. */
function toCalendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Treatment use cases.
 *
 * Shape matches the rest of the codebase: `clinicId` first, from the request's
 * verified tenant context, and `MutationContext` last. Nothing here accepts a
 * clinic id from a payload.
 *
 * FUTURE — SCHEDULE INTEGRATION: this service intentionally knows nothing about
 * appointments. When the two domains are joined, the seam is an optional
 * `treatmentId` on the appointment plus a read here that counts visits; no
 * treatment rule below needs to change for that.
 */
export class TreatmentService {
  constructor(
    private readonly treatments: TreatmentRepository = treatmentRepository,
    private readonly patients: PatientRepository = patientRepository,
    private readonly memberships: MembershipRepository = membershipRepository,
    private readonly audit: AuditLogService = auditLogService,
  ) {}

  // --- reads ----------------------------------------------------------------

  async listForPatient(
    clinicId: string,
    patientId: string,
    options: { status?: TreatmentStatus; includeProgress?: boolean } = {},
  ): Promise<TreatmentWithProgressDto[]> {
    await this.requirePatient(clinicId, patientId);

    const records = await this.treatments.listByPatient(
      patientId,
      clinicId,
      options.status === undefined ? {} : { status: options.status },
    );

    if (records.length === 0) {
      return [];
    }

    if (options.includeProgress === false) {
      return records.map((record) => ({ ...toTreatmentDto(record), progress: [] }));
    }

    // One query for every timeline rather than one per treatment.
    const progress = await this.treatments.listProgressByTreatmentIds(
      records.map((record) => record._id.toString()),
      clinicId,
    );
    const byTreatment = new Map<string, typeof progress>();
    for (const entry of progress) {
      const key = entry.treatmentId.toString();
      const bucket = byTreatment.get(key);
      if (bucket) {
        bucket.push(entry);
      } else {
        byTreatment.set(key, [entry]);
      }
    }

    const now = new Date();
    return records.map((record) =>
      toTreatmentWithProgressDto(record, byTreatment.get(record._id.toString()) ?? [], now),
    );
  }

  async getById(clinicId: string, treatmentId: string): Promise<TreatmentDto> {
    return toTreatmentDto(await this.requireTreatment(clinicId, treatmentId));
  }

  async listProgress(
    clinicId: string,
    treatmentId: string,
    page: { page?: number; limit?: number },
  ): Promise<{ result: PaginatedResult<TreatmentProgressDto>; pagination: PaginationParams }> {
    await this.requireTreatment(clinicId, treatmentId);
    const pagination = toPaginationParams(page);
    const { items, total } = await this.treatments.listProgressByTreatment(
      treatmentId,
      clinicId,
      pagination,
    );
    return { result: { items: items.map(toTreatmentProgressDto), total }, pagination };
  }

  // --- writes ---------------------------------------------------------------

  async create(
    clinicId: string,
    patientId: string,
    input: {
      treatmentType: string;
      status?: 'PLANNED' | 'ACTIVE';
      startDate?: string | null;
      expectedEndDate?: string | null;
      notes?: string | null;
      totalPlannedCost?: number | null;
    },
    context: MutationContext,
  ): Promise<TreatmentDto> {
    const patient = await this.requirePatient(clinicId, patientId);

    // Archived patients are read-only history; new care means restoring first.
    if (patient.status === PATIENT_STATUSES.ARCHIVED) {
      throw new BusinessRuleError('Cannot plan treatment for an archived patient', {
        code: ERROR_CODES.TREATMENT_PATIENT_ARCHIVED,
      });
    }

    const status = input.status ?? TREATMENT_STATUSES.PLANNED;

    // MVP: at most one live course per patient. PLANNED does not occupy the slot,
    // so a follow-up plan can be agreed while the current one finishes.
    if (status === TREATMENT_STATUSES.ACTIVE) {
      await this.requireNoOccupyingTreatment(clinicId, patientId);
    }

    const startDate =
      status === TREATMENT_STATUSES.ACTIVE
        ? input.startDate
          ? toCalendarDate(input.startDate)
          : today()
        : input.startDate
          ? toCalendarDate(input.startDate)
          : null;
    const expectedEndDate = input.expectedEndDate ? toCalendarDate(input.expectedEndDate) : null;

    this.assertDateRange(startDate, expectedEndDate);

    // ONE CLINIC = ONE OWNER-DOCTOR: resolved server-side, never from the payload.
    const doctorId = await this.resolveOwnerDoctorId(clinicId);

    const created = await this.treatments.create({
      clinicId,
      patientId,
      doctorId,
      createdBy: context.actorUserId,
      treatmentType: input.treatmentType,
      status,
      startDate,
      expectedEndDate,
      notes: input.notes ?? null,
      totalPlannedCost: input.totalPlannedCost ?? null,
    });

    await this.recordAudit(
      clinicId,
      created._id.toString(),
      AUDIT_ACTIONS.TREATMENT_CREATED,
      {
        patientId,
        treatmentType: created.treatmentType,
        status: created.status,
      },
      context,
    );

    if (status === TREATMENT_STATUSES.ACTIVE) {
      await this.treatments.createProgress({
        clinicId,
        patientId,
        treatmentId: created._id.toString(),
        occurredAt: startDate ?? new Date(),
        type: TREATMENT_EVENT_TYPES.STARTED,
        note: null,
        createdBy: context.actorUserId,
      });
    }

    return toTreatmentDto(created);
  }

  async update(
    clinicId: string,
    treatmentId: string,
    changes: {
      treatmentType?: string;
      startDate?: string | null;
      expectedEndDate?: string | null;
      notes?: string | null;
      totalPlannedCost?: number | null;
    },
    context: MutationContext,
  ): Promise<TreatmentDto> {
    const existing = await this.requireTreatment(clinicId, treatmentId);

    // A finished or abandoned course is history; correcting it would rewrite the
    // clinical record rather than change a plan.
    if (isClosedTreatmentStatus(existing.status)) {
      throw new BusinessRuleError('This treatment is closed and can no longer be edited', {
        code: ERROR_CODES.TREATMENT_ALREADY_CLOSED,
      });
    }

    const startDate =
      changes.startDate === undefined
        ? existing.startDate
        : changes.startDate
          ? toCalendarDate(changes.startDate)
          : null;
    const expectedEndDate =
      changes.expectedEndDate === undefined
        ? existing.expectedEndDate
        : changes.expectedEndDate
          ? toCalendarDate(changes.expectedEndDate)
          : null;

    this.assertDateRange(startDate, expectedEndDate);

    const updated = await this.treatments.update(treatmentId, clinicId, {
      updatedBy: context.actorUserId,
      ...(changes.treatmentType === undefined ? {} : { treatmentType: changes.treatmentType }),
      ...(changes.startDate === undefined ? {} : { startDate }),
      ...(changes.expectedEndDate === undefined ? {} : { expectedEndDate }),
      ...(changes.notes === undefined ? {} : { notes: changes.notes }),
      ...(changes.totalPlannedCost === undefined
        ? {}
        : { totalPlannedCost: changes.totalPlannedCost }),
    });

    if (!updated) {
      throw new NotFoundError('Treatment not found', { code: ERROR_CODES.TREATMENT_NOT_FOUND });
    }

    await this.recordAudit(
      clinicId,
      treatmentId,
      AUDIT_ACTIONS.TREATMENT_UPDATED,
      // Field names only — the audit trail is not a shadow copy of clinical data.
      { fields: Object.keys(changes) },
      context,
    );

    return toTreatmentDto(updated);
  }

  async start(
    clinicId: string,
    treatmentId: string,
    input: { startDate?: string; note?: string },
    context: MutationContext,
  ): Promise<TreatmentDto> {
    const existing = await this.requireTreatment(clinicId, treatmentId);
    const patientId = existing.patientId.toString();

    await this.requireNoOccupyingTreatment(clinicId, patientId, treatmentId);

    return this.transition(
      clinicId,
      existing,
      TREATMENT_STATUSES.ACTIVE,
      {
        startDate: input.startDate
          ? toCalendarDate(input.startDate)
          : (existing.startDate ?? today()),
      },
      input.note ?? null,
      context,
    );
  }

  async pause(
    clinicId: string,
    treatmentId: string,
    input: { reason?: string },
    context: MutationContext,
  ): Promise<TreatmentDto> {
    const existing = await this.requireTreatment(clinicId, treatmentId);
    return this.transition(
      clinicId,
      existing,
      TREATMENT_STATUSES.PAUSED,
      {},
      input.reason ?? null,
      context,
    );
  }

  async resume(
    clinicId: string,
    treatmentId: string,
    input: { note?: string },
    context: MutationContext,
  ): Promise<TreatmentDto> {
    const existing = await this.requireTreatment(clinicId, treatmentId);

    // Resuming re-enters ACTIVE, so it uses the same transition table entry as a
    // start; only the audit action and timeline event differ.
    return this.transition(
      clinicId,
      existing,
      TREATMENT_STATUSES.ACTIVE,
      {},
      input.note ?? null,
      context,
      { auditAction: AUDIT_ACTIONS.TREATMENT_RESUMED, eventType: TREATMENT_EVENT_TYPES.RESUMED },
    );
  }

  async complete(
    clinicId: string,
    treatmentId: string,
    input: { actualEndDate?: string; note?: string },
    context: MutationContext,
  ): Promise<TreatmentDto> {
    const existing = await this.requireTreatment(clinicId, treatmentId);
    const actualEndDate = input.actualEndDate ? toCalendarDate(input.actualEndDate) : today();

    if (existing.startDate && actualEndDate.getTime() < existing.startDate.getTime()) {
      throw new BusinessRuleError('Treatment cannot end before it started', {
        code: ERROR_CODES.TREATMENT_INVALID_DATE_RANGE,
      });
    }

    return this.transition(
      clinicId,
      existing,
      TREATMENT_STATUSES.COMPLETED,
      { actualEndDate },
      input.note ?? null,
      context,
    );
  }

  async cancel(
    clinicId: string,
    treatmentId: string,
    input: { reason: string },
    context: MutationContext,
  ): Promise<TreatmentDto> {
    const existing = await this.requireTreatment(clinicId, treatmentId);
    return this.transition(
      clinicId,
      existing,
      TREATMENT_STATUSES.CANCELLED,
      { actualEndDate: today(), cancellationReason: input.reason },
      input.reason,
      context,
    );
  }

  async addProgress(
    clinicId: string,
    treatmentId: string,
    input: { type: TreatmentEventType; occurredAt?: string; note?: string | null },
    context: MutationContext,
  ): Promise<TreatmentProgressDto> {
    const treatment = await this.requireTreatment(clinicId, treatmentId);

    if (isClosedTreatmentStatus(treatment.status)) {
      throw new BusinessRuleError('This treatment is closed and can no longer be edited', {
        code: ERROR_CODES.TREATMENT_ALREADY_CLOSED,
      });
    }

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    // A visit that has not happened yet belongs in the schedule, not the diary.
    if (occurredAt.getTime() > Date.now()) {
      throw new BusinessRuleError('Progress cannot be recorded in the future', {
        code: ERROR_CODES.TREATMENT_INVALID_DATE_RANGE,
      });
    }

    const created = await this.treatments.createProgress({
      clinicId,
      patientId: treatment.patientId.toString(),
      treatmentId,
      occurredAt,
      type: input.type,
      note: input.note ?? null,
      createdBy: context.actorUserId,
    });

    await this.recordAudit(
      clinicId,
      treatmentId,
      AUDIT_ACTIONS.TREATMENT_PROGRESS_ADDED,
      { type: input.type },
      context,
    );

    return toTreatmentProgressDto(created);
  }

  // --- internals ------------------------------------------------------------

  /**
   * Applies a status move: validates it against the transition table, writes it
   * with the previous status in the filter, then records audit and timeline.
   */
  private async transition(
    clinicId: string,
    existing: TreatmentRecord,
    target: TreatmentStatus,
    dates: { startDate?: Date; actualEndDate?: Date; cancellationReason?: string },
    note: string | null,
    context: MutationContext,
    overrides: { auditAction?: AuditAction; eventType?: TreatmentEventType } = {},
  ): Promise<TreatmentDto> {
    if (!canTransitionTreatment(existing.status, target)) {
      throw new BusinessRuleError(
        `A ${existing.status.toLowerCase()} treatment cannot become ${target.toLowerCase()}`,
        {
          code: ERROR_CODES.TREATMENT_INVALID_STATUS_TRANSITION,
          details: { from: existing.status, to: target },
        },
      );
    }

    const treatmentId = existing._id.toString();
    const updated = await this.treatments.changeStatus(treatmentId, clinicId, existing.status, {
      status: target,
      updatedBy: context.actorUserId,
      ...dates,
    });

    if (!updated) {
      // The status changed under us between the read and the write.
      throw new BusinessRuleError('This treatment was changed by someone else — reload and retry', {
        code: ERROR_CODES.TREATMENT_INVALID_STATUS_TRANSITION,
      });
    }

    await this.recordAudit(
      clinicId,
      treatmentId,
      overrides.auditAction ?? STATUS_AUDIT_ACTIONS[target],
      { from: existing.status, to: target },
      context,
    );

    const eventType = overrides.eventType ?? STATUS_EVENT_TYPES[target];
    if (eventType) {
      await this.treatments.createProgress({
        clinicId,
        patientId: existing.patientId.toString(),
        treatmentId,
        occurredAt: new Date(),
        type: eventType,
        note,
        createdBy: context.actorUserId,
      });
    }

    return toTreatmentDto(updated);
  }

  private async requirePatient(clinicId: string, patientId: string) {
    const patient = await this.patients.findByIdInClinic(patientId, clinicId);
    if (!patient) {
      // Same 404 whether the patient does not exist or belongs to another clinic.
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }
    return patient;
  }

  private async requireTreatment(clinicId: string, treatmentId: string): Promise<TreatmentRecord> {
    const treatment = await this.treatments.findByIdInClinic(treatmentId, clinicId);
    if (!treatment) {
      throw new NotFoundError('Treatment not found', { code: ERROR_CODES.TREATMENT_NOT_FOUND });
    }
    return treatment;
  }

  private async requireNoOccupyingTreatment(
    clinicId: string,
    patientId: string,
    exceptTreatmentId?: string,
  ): Promise<void> {
    const occupying = await this.treatments.findOccupyingForPatient(patientId, clinicId);
    if (!occupying || occupying._id.toString() === exceptTreatmentId) {
      return;
    }
    throw new ConflictError('This patient already has a treatment in progress', {
      code: ERROR_CODES.TREATMENT_ALREADY_ACTIVE,
      details: { treatmentId: occupying._id.toString(), status: occupying.status },
    });
  }

  /**
   * ONE CLINIC = ONE OWNER-DOCTOR.
   *
   * The treating doctor is the clinic's active owner. Reading it here rather
   * than trusting a payload is what keeps the invariant true even if a future
   * client starts sending a `doctorId`.
   */
  private async resolveOwnerDoctorId(clinicId: string): Promise<string> {
    const owner = await this.memberships.findActiveOwner(clinicId);
    if (!owner) {
      throw new BusinessRuleError('This clinic has no active owner-doctor', {
        code: ERROR_CODES.CLINIC_HAS_NO_DOCTOR,
      });
    }
    return owner.userId.toString();
  }

  private assertDateRange(startDate: Date | null, expectedEndDate: Date | null): void {
    if (startDate && expectedEndDate && expectedEndDate.getTime() < startDate.getTime()) {
      throw new BusinessRuleError('Expected end date must be on or after the start date', {
        code: ERROR_CODES.TREATMENT_INVALID_DATE_RANGE,
      });
    }
  }

  private async recordAudit(
    clinicId: string,
    treatmentId: string,
    action: AuditAction,
    metadata: Record<string, unknown>,
    context: MutationContext,
  ): Promise<void> {
    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action,
      resourceType: AUDIT_RESOURCE_TYPES.TREATMENT,
      resourceId: treatmentId,
      metadata,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}

export const treatmentService = new TreatmentService();

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
  patientMediaRepository,
  type PatientMediaRepository,
} from '../patient-media/patient-media.repository.js';
import {
  toTreatmentDto,
  toTreatmentMilestoneDto,
  toTreatmentWithMilestonesDto,
} from './treatment.mapper.js';
import { treatmentRepository, type TreatmentRepository } from './treatment.repository.js';
import {
  canTransitionTreatment,
  isClosedTreatmentStatus,
  TREATMENT_MILESTONE_TYPES,
  TREATMENT_STATUSES,
  TREATMENT_TYPES,
  type TreatmentDto,
  type TreatmentMilestoneDto,
  type TreatmentMilestoneType,
  type TreatmentRecord,
  type TreatmentStatus,
  type TreatmentType,
  type TreatmentWithMilestonesDto,
} from './treatment.types.js';

const STATUS_AUDIT_ACTIONS: Record<TreatmentStatus, AuditAction> = {
  PLANNED: AUDIT_ACTIONS.TREATMENT_CREATED,
  ACTIVE: AUDIT_ACTIONS.TREATMENT_STARTED,
  PAUSED: AUDIT_ACTIONS.TREATMENT_PAUSED,
  COMPLETED: AUDIT_ACTIONS.TREATMENT_COMPLETED,
  CANCELLED: AUDIT_ACTIONS.TREATMENT_CANCELLED,
};

const AUTOMATIC_MILESTONES: Partial<
  Record<TreatmentStatus, { type: TreatmentMilestoneType; title: string }>
> = {
  PAUSED: { type: TREATMENT_MILESTONE_TYPES.TREATMENT_PAUSED, title: 'Treatment paused' },
  COMPLETED: {
    type: TREATMENT_MILESTONE_TYPES.TREATMENT_COMPLETED,
    title: 'Treatment completed',
  },
};

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function toCalendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export class TreatmentService {
  constructor(
    private readonly treatments: TreatmentRepository = treatmentRepository,
    private readonly patients: PatientRepository = patientRepository,
    private readonly memberships: MembershipRepository = membershipRepository,
    private readonly audit: AuditLogService = auditLogService,
    private readonly media: PatientMediaRepository = patientMediaRepository,
  ) {}

  async listForPatient(
    clinicId: string,
    patientId: string,
    options: { status?: TreatmentStatus; includeMilestones?: boolean } = {},
  ): Promise<TreatmentWithMilestonesDto[]> {
    await this.requirePatient(clinicId, patientId);
    const records = await this.treatments.listByPatient(
      patientId,
      clinicId,
      options.status === undefined ? {} : { status: options.status },
    );
    if (records.length === 0) return [];
    if (options.includeMilestones === false) {
      return records.map((record) => ({ ...toTreatmentDto(record), milestones: [] }));
    }
    const milestones = await this.treatments.listMilestonesByTreatmentIds(
      records.map((record) => record._id.toString()),
      clinicId,
    );
    const byTreatment = new Map<string, typeof milestones>();
    for (const milestone of milestones) {
      const id = milestone.treatmentId.toString();
      byTreatment.set(id, [...(byTreatment.get(id) ?? []), milestone]);
    }
    const now = new Date();
    return records.map((record) =>
      toTreatmentWithMilestonesDto(record, byTreatment.get(record._id.toString()) ?? [], now),
    );
  }

  async getById(clinicId: string, treatmentId: string): Promise<TreatmentDto> {
    return toTreatmentDto(await this.requireTreatment(clinicId, treatmentId));
  }

  async listMilestones(
    clinicId: string,
    treatmentId: string,
    page: { page?: number; limit?: number },
  ): Promise<{ result: PaginatedResult<TreatmentMilestoneDto>; pagination: PaginationParams }> {
    await this.requireTreatment(clinicId, treatmentId);
    const pagination = toPaginationParams(page);
    const { items, total } = await this.treatments.listMilestonesByTreatment(
      treatmentId,
      clinicId,
      pagination,
    );
    return { result: { items: items.map(toTreatmentMilestoneDto), total }, pagination };
  }

  async create(
    clinicId: string,
    patientId: string,
    input: {
      type: TreatmentType;
      customTypeLabel?: string | null;
      status?: 'PLANNED' | 'ACTIVE';
      startDate?: string | null;
      expectedEndDate?: string | null;
      agreedPrice?: number | null;
      notes?: string | null;
    },
    context: MutationContext,
  ): Promise<TreatmentDto> {
    const patient = await this.requirePatient(clinicId, patientId);
    if (patient.status === PATIENT_STATUSES.ARCHIVED) {
      throw new BusinessRuleError('Cannot plan treatment for an archived patient', {
        code: ERROR_CODES.TREATMENT_PATIENT_ARCHIVED,
      });
    }
    this.assertCustomType(input.type, input.customTypeLabel ?? null);
    const status = input.status ?? TREATMENT_STATUSES.PLANNED;
    if (status === TREATMENT_STATUSES.ACTIVE)
      await this.requireNoActiveTreatment(clinicId, patientId);
    const startDate =
      status === TREATMENT_STATUSES.ACTIVE
        ? input.startDate
          ? toCalendarDate(input.startDate)
          : today()
        : null;
    const expectedEndDate = input.expectedEndDate ? toCalendarDate(input.expectedEndDate) : null;
    this.assertDateRange(startDate, expectedEndDate);
    const doctorId = await this.resolveOwnerDoctorId(clinicId);

    let created: TreatmentRecord;
    try {
      created = await this.treatments.create({
        clinicId,
        patientId,
        doctorId,
        type: input.type,
        customTypeLabel: input.type === TREATMENT_TYPES.OTHER ? input.customTypeLabel : null,
        status,
        startDate,
        expectedEndDate,
        agreedPrice: input.agreedPrice ?? null,
        notes: input.notes ?? null,
        createdBy: context.actorUserId,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw this.activeConflict();
      throw error;
    }

    await this.recordTreatmentAudit(
      clinicId,
      patientId,
      created._id.toString(),
      AUDIT_ACTIONS.TREATMENT_CREATED,
      { type: created.type, status: created.status },
      context,
    );
    await this.createAutomaticMilestone(
      clinicId,
      patientId,
      created._id.toString(),
      TREATMENT_MILESTONE_TYPES.TREATMENT_PLAN_CREATED,
      'Treatment plan created',
      created.createdAt,
      context,
    );
    return toTreatmentDto(created);
  }

  async update(
    clinicId: string,
    treatmentId: string,
    changes: {
      type?: TreatmentType;
      customTypeLabel?: string | null;
      expectedEndDate?: string | null;
      agreedPrice?: number | null;
      notes?: string | null;
    },
    context: MutationContext,
  ): Promise<TreatmentDto> {
    const existing = await this.requireTreatment(clinicId, treatmentId);
    if (isClosedTreatmentStatus(existing.status)) {
      throw new BusinessRuleError('This treatment is closed and can no longer be edited', {
        code: ERROR_CODES.TREATMENT_ALREADY_CLOSED,
      });
    }
    const type = changes.type ?? existing.type;
    if (type !== TREATMENT_TYPES.OTHER && changes.customTypeLabel) {
      this.assertCustomType(type, changes.customTypeLabel);
    }
    const customTypeLabel =
      type === TREATMENT_TYPES.OTHER
        ? (changes.customTypeLabel ??
          (existing.type === TREATMENT_TYPES.OTHER ? existing.customTypeLabel : null))
        : null;
    this.assertCustomType(type, customTypeLabel);
    const expectedEndDate =
      changes.expectedEndDate === undefined
        ? existing.expectedEndDate
        : changes.expectedEndDate
          ? toCalendarDate(changes.expectedEndDate)
          : null;
    this.assertDateRange(existing.startDate, expectedEndDate);
    const updated = await this.treatments.update(treatmentId, clinicId, {
      updatedBy: context.actorUserId,
      ...(changes.type === undefined ? {} : { type }),
      ...(changes.type === undefined && changes.customTypeLabel === undefined
        ? {}
        : { customTypeLabel }),
      ...(changes.expectedEndDate === undefined ? {} : { expectedEndDate }),
      ...(changes.agreedPrice === undefined ? {} : { agreedPrice: changes.agreedPrice }),
      ...(changes.notes === undefined ? {} : { notes: changes.notes }),
    });
    if (!updated)
      throw new NotFoundError('Treatment not found', { code: ERROR_CODES.TREATMENT_NOT_FOUND });
    await this.recordTreatmentAudit(
      clinicId,
      existing.patientId.toString(),
      treatmentId,
      AUDIT_ACTIONS.TREATMENT_UPDATED,
      { fields: Object.keys(changes) },
      context,
    );
    return toTreatmentDto(updated);
  }

  async start(
    clinicId: string,
    treatmentId: string,
    input: { startDate?: string },
    context: MutationContext,
  ): Promise<TreatmentDto> {
    const existing = await this.requireTreatment(clinicId, treatmentId);
    await this.requireNoActiveTreatment(clinicId, existing.patientId.toString(), treatmentId);
    return this.transition(
      clinicId,
      existing,
      TREATMENT_STATUSES.ACTIVE,
      {
        startDate: input.startDate
          ? toCalendarDate(input.startDate)
          : (existing.startDate ?? today()),
      },
      context,
    );
  }

  async pause(
    clinicId: string,
    treatmentId: string,
    input: { reason?: string },
    context: MutationContext,
  ): Promise<TreatmentDto> {
    return this.transition(
      clinicId,
      await this.requireTreatment(clinicId, treatmentId),
      TREATMENT_STATUSES.PAUSED,
      {},
      context,
      input.reason ?? null,
    );
  }

  async resume(
    clinicId: string,
    treatmentId: string,
    _input: Record<string, never>,
    context: MutationContext,
  ): Promise<TreatmentDto> {
    const existing = await this.requireTreatment(clinicId, treatmentId);
    await this.requireNoActiveTreatment(clinicId, existing.patientId.toString(), treatmentId);
    return this.transition(clinicId, existing, TREATMENT_STATUSES.ACTIVE, {}, context, null, {
      auditAction: AUDIT_ACTIONS.TREATMENT_RESUMED,
      milestone: {
        type: TREATMENT_MILESTONE_TYPES.TREATMENT_RESUMED,
        title: 'Treatment resumed',
      },
    });
  }

  async complete(
    clinicId: string,
    treatmentId: string,
    input: {
      completionDate?: string;
      debondPerformed?: boolean;
      debondDate?: string | null;
      retentionRequired?: boolean;
      finalMediaIds?: string[];
    },
    context: MutationContext,
  ): Promise<TreatmentDto> {
    const existing = await this.requireTreatment(clinicId, treatmentId);
    const finalMediaIds = [...new Set(input.finalMediaIds ?? [])];
    if (finalMediaIds.length !== (input.finalMediaIds ?? []).length) {
      throw new BusinessRuleError('Final media references must be unique');
    }
    const mediaRecords = await this.media.findManyByIdsForPatient(
      finalMediaIds,
      existing.patientId.toString(),
      clinicId,
    );
    if (mediaRecords.length !== finalMediaIds.length) {
      throw new NotFoundError('One or more final media records were not found for this patient');
    }
    if (
      mediaRecords.some(
        (record) => record.treatmentId && record.treatmentId.toString() !== treatmentId,
      )
    ) {
      throw new BusinessRuleError('Final media must be unassigned or linked to this treatment');
    }
    const completionDate = input.completionDate ? toCalendarDate(input.completionDate) : today();
    const debondDate = input.debondDate ? toCalendarDate(input.debondDate) : null;
    if (debondDate && debondDate.getTime() > completionDate.getTime()) {
      throw new BusinessRuleError('Debond date cannot be after treatment completion date', {
        code: ERROR_CODES.TREATMENT_INVALID_DATE_RANGE,
      });
    }
    return this.transition(
      clinicId,
      existing,
      TREATMENT_STATUSES.COMPLETED,
      {
        completedAt: new Date(),
        completionDate,
        debondPerformed: input.debondPerformed ?? false,
        debondDate,
        retentionRequired: input.retentionRequired ?? false,
        finalMediaIds,
      },
      context,
      null,
      {
        auditMetadata: {
          completionDate: input.completionDate ?? completionDate.toISOString().slice(0, 10),
          debondPerformed: input.debondPerformed ?? false,
          debondDate: input.debondDate ?? null,
          retentionRequired: input.retentionRequired ?? false,
          finalMediaCount: finalMediaIds.length,
        },
      },
    );
  }

  async cancel(
    clinicId: string,
    treatmentId: string,
    input: { reason: string },
    context: MutationContext,
  ): Promise<TreatmentDto> {
    return this.transition(
      clinicId,
      await this.requireTreatment(clinicId, treatmentId),
      TREATMENT_STATUSES.CANCELLED,
      { cancellationReason: input.reason },
      context,
    );
  }

  async addMilestone(
    clinicId: string,
    treatmentId: string,
    input: {
      type: TreatmentMilestoneType;
      title: string;
      description?: string | null;
      occurredAt?: string;
    },
    context: MutationContext,
  ): Promise<TreatmentMilestoneDto> {
    const treatment = await this.requireTreatment(clinicId, treatmentId);
    if (isClosedTreatmentStatus(treatment.status)) {
      throw new BusinessRuleError('This treatment is closed and can no longer be edited', {
        code: ERROR_CODES.TREATMENT_ALREADY_CLOSED,
      });
    }
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    this.assertNotFuture(occurredAt);
    const created = await this.treatments.createMilestone({
      clinicId,
      patientId: treatment.patientId.toString(),
      treatmentId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      occurredAt,
      createdBy: context.actorUserId,
    });
    await this.recordMilestoneAudit(
      clinicId,
      treatment.patientId.toString(),
      treatmentId,
      created._id.toString(),
      AUDIT_ACTIONS.TREATMENT_MILESTONE_CREATED,
      { type: input.type },
      context,
    );
    return toTreatmentMilestoneDto(created);
  }

  async updateMilestone(
    clinicId: string,
    treatmentId: string,
    milestoneId: string,
    changes: { title?: string; description?: string | null; occurredAt?: string },
    context: MutationContext,
  ): Promise<TreatmentMilestoneDto> {
    const treatment = await this.requireTreatment(clinicId, treatmentId);
    const existing = await this.treatments.findMilestoneInTreatment(
      milestoneId,
      treatmentId,
      clinicId,
    );
    if (!existing) {
      throw new NotFoundError('Treatment milestone not found', {
        code: ERROR_CODES.TREATMENT_MILESTONE_NOT_FOUND,
      });
    }
    const occurredAt = changes.occurredAt ? new Date(changes.occurredAt) : undefined;
    if (occurredAt) this.assertNotFuture(occurredAt);
    const updated = await this.treatments.updateMilestone(milestoneId, treatmentId, clinicId, {
      updatedBy: context.actorUserId,
      ...(changes.title === undefined ? {} : { title: changes.title }),
      ...(changes.description === undefined ? {} : { description: changes.description }),
      ...(occurredAt === undefined ? {} : { occurredAt }),
    });
    if (!updated) {
      throw new NotFoundError('Treatment milestone not found', {
        code: ERROR_CODES.TREATMENT_MILESTONE_NOT_FOUND,
      });
    }
    await this.recordMilestoneAudit(
      clinicId,
      treatment.patientId.toString(),
      treatmentId,
      milestoneId,
      AUDIT_ACTIONS.TREATMENT_MILESTONE_UPDATED,
      { fields: Object.keys(changes) },
      context,
    );
    return toTreatmentMilestoneDto(updated);
  }

  private async transition(
    clinicId: string,
    existing: TreatmentRecord,
    target: TreatmentStatus,
    fields: {
      startDate?: Date;
      completedAt?: Date;
      completionDate?: Date;
      debondPerformed?: boolean;
      debondDate?: Date | null;
      retentionRequired?: boolean;
      finalMediaIds?: string[];
      cancellationReason?: string;
    },
    context: MutationContext,
    description: string | null = null,
    overrides: {
      auditAction?: AuditAction;
      milestone?: { type: TreatmentMilestoneType; title: string };
      auditMetadata?: Record<string, unknown>;
    } = {},
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
    let updated: TreatmentRecord | null;
    try {
      updated = await this.treatments.changeStatus(
        existing._id.toString(),
        clinicId,
        existing.status,
        { status: target, updatedBy: context.actorUserId, ...fields },
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) throw this.activeConflict();
      throw error;
    }
    if (!updated) {
      throw new BusinessRuleError('This treatment was changed by someone else — reload and retry', {
        code: ERROR_CODES.TREATMENT_INVALID_STATUS_TRANSITION,
      });
    }
    const treatmentId = existing._id.toString();
    const patientId = existing.patientId.toString();
    await this.recordTreatmentAudit(
      clinicId,
      patientId,
      treatmentId,
      overrides.auditAction ?? STATUS_AUDIT_ACTIONS[target],
      { from: existing.status, to: target, ...(overrides.auditMetadata ?? {}) },
      context,
    );
    const milestone = overrides.milestone ?? AUTOMATIC_MILESTONES[target];
    if (milestone) {
      await this.createAutomaticMilestone(
        clinicId,
        patientId,
        treatmentId,
        milestone.type,
        milestone.title,
        fields.completedAt ?? new Date(),
        context,
        description,
      );
    }
    return toTreatmentDto(updated);
  }

  private async createAutomaticMilestone(
    clinicId: string,
    patientId: string,
    treatmentId: string,
    type: TreatmentMilestoneType,
    title: string,
    occurredAt: Date,
    context: MutationContext,
    description: string | null = null,
  ): Promise<void> {
    const created = await this.treatments.createMilestone({
      clinicId,
      patientId,
      treatmentId,
      type,
      title,
      description,
      occurredAt,
      createdBy: context.actorUserId,
    });
    await this.recordMilestoneAudit(
      clinicId,
      patientId,
      treatmentId,
      created._id.toString(),
      AUDIT_ACTIONS.TREATMENT_MILESTONE_CREATED,
      { type, automatic: true },
      context,
    );
  }

  private async requirePatient(clinicId: string, patientId: string) {
    const patient = await this.patients.findByIdInClinic(patientId, clinicId);
    if (!patient)
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    return patient;
  }

  private async requireTreatment(clinicId: string, treatmentId: string): Promise<TreatmentRecord> {
    const treatment = await this.treatments.findByIdInClinic(treatmentId, clinicId);
    if (!treatment) {
      throw new NotFoundError('Treatment not found', { code: ERROR_CODES.TREATMENT_NOT_FOUND });
    }
    return treatment;
  }

  private async requireNoActiveTreatment(
    clinicId: string,
    patientId: string,
    exceptTreatmentId?: string,
  ): Promise<void> {
    const active = await this.treatments.findActiveForPatient(patientId, clinicId);
    if (!active || active._id.toString() === exceptTreatmentId) return;
    throw this.activeConflict(active._id.toString());
  }

  private activeConflict(treatmentId?: string): ConflictError {
    return new ConflictError('This patient already has an active treatment', {
      code: ERROR_CODES.TREATMENT_ALREADY_ACTIVE,
      ...(treatmentId ? { details: { treatmentId } } : {}),
    });
  }

  private async resolveOwnerDoctorId(clinicId: string): Promise<string> {
    const owner = await this.memberships.findActiveOwner(clinicId);
    if (!owner) {
      throw new BusinessRuleError('This clinic has no active owner-doctor', {
        code: ERROR_CODES.CLINIC_HAS_NO_DOCTOR,
      });
    }
    return owner.userId.toString();
  }

  private assertCustomType(type: TreatmentType, customTypeLabel: string | null): void {
    const valid =
      type === TREATMENT_TYPES.OTHER ? Boolean(customTypeLabel?.trim()) : !customTypeLabel;
    if (!valid) {
      throw new BusinessRuleError('Custom treatment type must only be used with OTHER', {
        code: ERROR_CODES.TREATMENT_INVALID_TYPE,
      });
    }
  }

  private assertDateRange(startDate: Date | null, expectedEndDate: Date | null): void {
    if (startDate && expectedEndDate && expectedEndDate.getTime() < startDate.getTime()) {
      throw new BusinessRuleError('Expected end date must be on or after the start date', {
        code: ERROR_CODES.TREATMENT_INVALID_DATE_RANGE,
      });
    }
  }

  private assertNotFuture(occurredAt: Date): void {
    if (occurredAt.getTime() > Date.now()) {
      throw new BusinessRuleError('Milestones cannot be recorded in the future', {
        code: ERROR_CODES.TREATMENT_INVALID_DATE_RANGE,
      });
    }
  }

  private async recordTreatmentAudit(
    clinicId: string,
    patientId: string,
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
      metadata: { patientId, treatmentId, ...metadata },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  private async recordMilestoneAudit(
    clinicId: string,
    patientId: string,
    treatmentId: string,
    milestoneId: string,
    action: AuditAction,
    metadata: Record<string, unknown>,
    context: MutationContext,
  ): Promise<void> {
    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action,
      resourceType: AUDIT_RESOURCE_TYPES.TREATMENT_MILESTONE,
      resourceId: milestoneId,
      metadata: { patientId, treatmentId, milestoneId, ...metadata },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}

export const treatmentService = new TreatmentService();

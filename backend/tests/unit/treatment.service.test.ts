import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/common/constants/error-codes.js';
import { AppError } from '../../src/common/errors/app-error.js';
import type { MutationContext } from '../../src/common/utils/request-context.js';
import type { AuditLogService } from '../../src/modules/audit-logs/audit-log.service.js';
import type { MembershipRepository } from '../../src/modules/memberships/membership.repository.js';
import type { PatientRepository } from '../../src/modules/patients/patient.repository.js';
import { PATIENT_STATUSES } from '../../src/modules/patients/patient.types.js';
import type { TreatmentRepository } from '../../src/modules/treatments/treatment.repository.js';
import { TreatmentService } from '../../src/modules/treatments/treatment.service.js';
import {
  TREATMENT_MILESTONE_TYPES,
  TREATMENT_STATUSES,
  TREATMENT_TYPES,
  type CreateTreatmentInput,
  type CreateTreatmentMilestoneInput,
  type TreatmentMilestoneRecord,
  type TreatmentRecord,
  type TreatmentStatus,
  type TreatmentStatusChangeFields,
  type UpdateTreatmentFields,
  type UpdateTreatmentMilestoneFields,
} from '../../src/modules/treatments/treatment.types.js';

const CLINIC_ID = '652f1c9b8a1e4f0012ab34cd';
const OTHER_CLINIC_ID = '652f1c9b8a1e4f0012ab99ff';
const OWNER_ID = '652f1c9b8a1e4f0012ab0001';
const PATIENT_ID = '652f1c9b8a1e4f0012abaaaa';
const ACTOR: MutationContext = { actorUserId: OWNER_ID, ip: null, userAgent: null };

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

class FakeTreatmentRepository {
  treatments: TreatmentRecord[] = [];
  milestones: TreatmentMilestoneRecord[] = [];

  async findByIdInClinic(id: string, clinicId: string): Promise<TreatmentRecord | null> {
    return (
      this.treatments.find(
        (item) => item._id.toString() === id && item.clinicId.toString() === clinicId,
      ) ?? null
    );
  }

  async listByPatient(
    patientId: string,
    clinicId: string,
    filters: { status?: TreatmentStatus } = {},
  ): Promise<TreatmentRecord[]> {
    return this.treatments.filter(
      (item) =>
        item.patientId.toString() === patientId &&
        item.clinicId.toString() === clinicId &&
        (!filters.status || item.status === filters.status),
    );
  }

  async findActiveForPatient(patientId: string, clinicId: string): Promise<TreatmentRecord | null> {
    return (
      this.treatments.find(
        (item) =>
          item.patientId.toString() === patientId &&
          item.clinicId.toString() === clinicId &&
          item.status === TREATMENT_STATUSES.ACTIVE,
      ) ?? null
    );
  }

  async create(input: CreateTreatmentInput): Promise<TreatmentRecord> {
    const now = new Date();
    const record: TreatmentRecord = {
      _id: new Types.ObjectId(),
      clinicId: new Types.ObjectId(input.clinicId),
      patientId: new Types.ObjectId(input.patientId),
      doctorId: new Types.ObjectId(input.doctorId),
      type: input.type,
      customTypeLabel: input.customTypeLabel ?? null,
      status: input.status ?? TREATMENT_STATUSES.PLANNED,
      startDate: input.startDate ?? null,
      expectedEndDate: input.expectedEndDate ?? null,
      completedAt: null,
      agreedPrice: input.agreedPrice ?? null,
      notes: input.notes ?? null,
      cancellationReason: null,
      createdBy: new Types.ObjectId(input.createdBy),
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    this.treatments.push(record);
    return record;
  }

  async update(id: string, clinicId: string, changes: UpdateTreatmentFields) {
    const record = await this.findByIdInClinic(id, clinicId);
    if (!record) return null;
    if (changes.type !== undefined) record.type = changes.type;
    if (changes.customTypeLabel !== undefined) record.customTypeLabel = changes.customTypeLabel;
    if (changes.expectedEndDate !== undefined) record.expectedEndDate = changes.expectedEndDate;
    if (changes.agreedPrice !== undefined) record.agreedPrice = changes.agreedPrice;
    if (changes.notes !== undefined) record.notes = changes.notes;
    record.updatedBy = new Types.ObjectId(changes.updatedBy);
    return record;
  }

  async changeStatus(
    id: string,
    clinicId: string,
    expectedFrom: TreatmentStatus,
    changes: TreatmentStatusChangeFields,
  ) {
    const record = await this.findByIdInClinic(id, clinicId);
    if (!record || record.status !== expectedFrom) return null;
    record.status = changes.status;
    if (changes.startDate !== undefined) record.startDate = changes.startDate;
    if (changes.completedAt !== undefined) record.completedAt = changes.completedAt;
    if (changes.cancellationReason !== undefined) {
      record.cancellationReason = changes.cancellationReason;
    }
    record.updatedBy = new Types.ObjectId(changes.updatedBy);
    return record;
  }

  async createMilestone(input: CreateTreatmentMilestoneInput): Promise<TreatmentMilestoneRecord> {
    const now = new Date();
    const record: TreatmentMilestoneRecord = {
      _id: new Types.ObjectId(),
      clinicId: new Types.ObjectId(input.clinicId),
      patientId: new Types.ObjectId(input.patientId),
      treatmentId: new Types.ObjectId(input.treatmentId),
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      occurredAt: input.occurredAt,
      createdBy: new Types.ObjectId(input.createdBy),
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    this.milestones.push(record);
    return record;
  }

  async findMilestoneInTreatment(id: string, treatmentId: string, clinicId: string) {
    return (
      this.milestones.find(
        (item) =>
          item._id.toString() === id &&
          item.treatmentId.toString() === treatmentId &&
          item.clinicId.toString() === clinicId,
      ) ?? null
    );
  }

  async updateMilestone(
    id: string,
    treatmentId: string,
    clinicId: string,
    changes: UpdateTreatmentMilestoneFields,
  ) {
    const record = await this.findMilestoneInTreatment(id, treatmentId, clinicId);
    if (!record) return null;
    if (changes.title !== undefined) record.title = changes.title;
    if (changes.description !== undefined) record.description = changes.description;
    if (changes.occurredAt !== undefined) record.occurredAt = changes.occurredAt;
    record.updatedBy = new Types.ObjectId(changes.updatedBy);
    return record;
  }

  async listMilestonesByTreatment(treatmentId: string, clinicId: string) {
    const items = this.milestones.filter(
      (item) =>
        item.treatmentId.toString() === treatmentId && item.clinicId.toString() === clinicId,
    );
    return { items, total: items.length };
  }

  async listMilestonesByTreatmentIds(ids: string[], clinicId: string) {
    return this.milestones.filter(
      (item) => ids.includes(item.treatmentId.toString()) && item.clinicId.toString() === clinicId,
    );
  }
}

describe('TreatmentService', () => {
  let repository: FakeTreatmentRepository;
  let service: TreatmentService;
  let audits: Array<{ action: string; metadata?: Record<string, unknown> }>;

  beforeEach(() => {
    repository = new FakeTreatmentRepository();
    audits = [];
    const patients = {
      findByIdInClinic: async (patientId: string, clinicId: string) =>
        patientId === PATIENT_ID && clinicId === CLINIC_ID
          ? { _id: new Types.ObjectId(PATIENT_ID), status: PATIENT_STATUSES.ACTIVE }
          : null,
    } as unknown as PatientRepository;
    const memberships = {
      findActiveOwner: async () => ({ userId: new Types.ObjectId(OWNER_ID) }),
    } as unknown as MembershipRepository;
    const audit = {
      record: async (event: { action: string; metadata?: Record<string, unknown> }) => {
        audits.push(event);
      },
    } as unknown as AuditLogService;
    service = new TreatmentService(
      repository as unknown as TreatmentRepository,
      patients,
      memberships,
      audit,
    );
  });

  async function create(status: 'PLANNED' | 'ACTIVE' = 'PLANNED') {
    return service.create(
      CLINIC_ID,
      PATIENT_ID,
      { type: TREATMENT_TYPES.METAL_BRACES, status },
      ACTOR,
    );
  }

  it('creates a plan with trusted ownership and a persisted plan milestone', async () => {
    const result = await service.create(
      CLINIC_ID,
      PATIENT_ID,
      {
        type: TREATMENT_TYPES.CLEAR_ALIGNERS,
        agreedPrice: 3600,
        startDate: '2026-08-08',
      },
      ACTOR,
    );
    expect(result.doctorId).toBe(OWNER_ID);
    expect(result.agreedPrice).toBe(3600);
    expect(result.startDate).toBeNull();
    expect(repository.milestones[0]?.type).toBe(TREATMENT_MILESTONE_TYPES.TREATMENT_PLAN_CREATED);
    expect(audits.map((event) => event.action)).toContain('treatment.created');
  });

  it('requires a custom label only for OTHER', async () => {
    await expectCode(
      service.create(CLINIC_ID, PATIENT_ID, { type: TREATMENT_TYPES.OTHER }, ACTOR),
      ERROR_CODES.TREATMENT_INVALID_TYPE,
    );
    const result = await service.create(
      CLINIC_ID,
      PATIENT_ID,
      { type: TREATMENT_TYPES.OTHER, customTypeLabel: 'Lingual braces' },
      ACTOR,
    );
    expect(result.customTypeLabel).toBe('Lingual braces');
  });

  it('rejects a patient and treatment belonging to another clinic', async () => {
    await expectCode(
      service.create(OTHER_CLINIC_ID, PATIENT_ID, { type: TREATMENT_TYPES.RETAINER }, ACTOR),
      ERROR_CODES.PATIENT_NOT_FOUND,
    );
    const treatment = await create();
    await expectCode(
      service.getById(OTHER_CLINIC_ID, treatment.id),
      ERROR_CODES.TREATMENT_NOT_FOUND,
    );
  });

  it('enforces one ACTIVE treatment but permits a new one after pause', async () => {
    const active = await create('ACTIVE');
    await expectCode(create('ACTIVE'), ERROR_CODES.TREATMENT_ALREADY_ACTIVE);
    await service.pause(CLINIC_ID, active.id, {}, ACTOR);
    const second = await create('ACTIVE');
    expect(second.status).toBe(TREATMENT_STATUSES.ACTIVE);
  });

  it('starts a plan and sets startDate when absent', async () => {
    const plan = await create();
    const started = await service.start(CLINIC_ID, plan.id, {}, ACTOR);
    expect(started.status).toBe(TREATMENT_STATUSES.ACTIVE);
    expect(started.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('pauses and resumes while preserving startDate and writing milestones', async () => {
    const active = await create('ACTIVE');
    const originalStart = active.startDate;
    await service.pause(CLINIC_ID, active.id, { reason: 'Medical break' }, ACTOR);
    const resumed = await service.resume(CLINIC_ID, active.id, {}, ACTOR);
    expect(resumed.startDate).toBe(originalStart);
    expect(repository.milestones.map((item) => item.type)).toEqual([
      TREATMENT_MILESTONE_TYPES.TREATMENT_PLAN_CREATED,
      TREATMENT_MILESTONE_TYPES.TREATMENT_PAUSED,
      TREATMENT_MILESTONE_TYPES.TREATMENT_RESUMED,
    ]);
  });

  it('does not allow a paused treatment to complete directly', async () => {
    const active = await create('ACTIVE');
    await service.pause(CLINIC_ID, active.id, {}, ACTOR);
    await expectCode(
      service.complete(CLINIC_ID, active.id, {}, ACTOR),
      ERROR_CODES.TREATMENT_INVALID_STATUS_TRANSITION,
    );
  });

  it('completes active care with a completion timestamp and milestone', async () => {
    const active = await create('ACTIVE');
    const completed = await service.complete(CLINIC_ID, active.id, {}, ACTOR);
    expect(completed.completedAt).not.toBeNull();
    expect(repository.milestones.at(-1)?.type).toBe(TREATMENT_MILESTONE_TYPES.TREATMENT_COMPLETED);
  });

  it('cancels without deleting the record', async () => {
    const plan = await create();
    const cancelled = await service.cancel(CLINIC_ID, plan.id, { reason: 'Declined' }, ACTOR);
    expect(cancelled.status).toBe(TREATMENT_STATUSES.CANCELLED);
    expect(cancelled.cancellationReason).toBe('Declined');
    expect((await service.listForPatient(CLINIC_ID, PATIENT_ID))[0]?.id).toBe(plan.id);
  });

  it('validates date ranges while editing active care', async () => {
    const active = await create('ACTIVE');
    await expectCode(
      service.update(CLINIC_ID, active.id, { expectedEndDate: '2026-05-31' }, ACTOR),
      ERROR_CODES.TREATMENT_INVALID_DATE_RANGE,
    );
  });

  it('creates, lists and audits meaningful milestones', async () => {
    const active = await create('ACTIVE');
    const milestone = await service.addMilestone(
      CLINIC_ID,
      active.id,
      {
        type: TREATMENT_MILESTONE_TYPES.APPLIANCE_FITTED,
        title: 'Upper and lower appliance fitted',
        description: 'Home-care instructions reviewed.',
      },
      ACTOR,
    );
    const list = await service.listMilestones(CLINIC_ID, active.id, {});
    expect(list.result.items.map((item) => item.id)).toContain(milestone.id);
    expect(audits.at(-1)?.action).toBe('treatment_milestone.created');
  });

  it('updates a milestone without destroying its identity or history', async () => {
    const active = await create('ACTIVE');
    const milestone = await service.addMilestone(
      CLINIC_ID,
      active.id,
      { type: TREATMENT_MILESTONE_TYPES.CONTROL, title: 'Monthly control' },
      ACTOR,
    );
    const updated = await service.updateMilestone(
      CLINIC_ID,
      active.id,
      milestone.id,
      { title: 'Six-week control' },
      ACTOR,
    );
    expect(updated.id).toBe(milestone.id);
    expect(updated.title).toBe('Six-week control');
    expect(audits.at(-1)?.action).toBe('treatment_milestone.updated');
  });

  it('rejects future milestones', async () => {
    const active = await create('ACTIVE');
    await expectCode(
      service.addMilestone(
        CLINIC_ID,
        active.id,
        {
          type: TREATMENT_MILESTONE_TYPES.CONTROL,
          title: 'Future control',
          occurredAt: '2999-01-01T00:00:00.000Z',
        },
        ACTOR,
      ),
      ERROR_CODES.TREATMENT_INVALID_DATE_RANGE,
    );
  });
});

import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/common/constants/error-codes.js';
import { AppError } from '../../src/common/errors/app-error.js';
import type { MutationContext } from '../../src/common/utils/request-context.js';
import type { AuditLogService } from '../../src/modules/audit-logs/audit-log.service.js';
import type { MembershipRepository } from '../../src/modules/memberships/membership.repository.js';
import type { PatientRepository } from '../../src/modules/patients/patient.repository.js';
import { PATIENT_STATUSES, type PatientStatus } from '../../src/modules/patients/patient.types.js';
import type { TreatmentRepository } from '../../src/modules/treatments/treatment.repository.js';
import { TreatmentService } from '../../src/modules/treatments/treatment.service.js';
import {
  canTransitionTreatment,
  OCCUPYING_TREATMENT_STATUSES,
  TREATMENT_EVENT_TYPES,
  TREATMENT_STATUSES,
  type CreateTreatmentInput,
  type CreateTreatmentProgressInput,
  type TreatmentProgressRecord,
  type TreatmentRecord,
  type TreatmentStatus,
  type TreatmentStatusChangeFields,
  type UpdateTreatmentFields,
} from '../../src/modules/treatments/treatment.types.js';

const CLINIC_A = '652f1c9b8a1e4f0012ab34cd';
const CLINIC_B = '652f1c9b8a1e4f0012ab99ff';
const OWNER_ID = '652f1c9b8a1e4f0012ab0001';
const PATIENT_ID = '652f1c9b8a1e4f0012abaaaa';
const OTHER_PATIENT_ID = '652f1c9b8a1e4f0012abbbbb';
const ACTOR: MutationContext = { actorUserId: OWNER_ID, ip: null, userAgent: null };

/** Asserts a use case rejected with one specific business error code. */
async function expectRejection(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error, `expected a rejection with code ${code}`).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

/** In-memory treatment store mirroring the repository contract, tenant filter included. */
class FakeTreatmentRepository {
  treatments: TreatmentRecord[] = [];
  progress: TreatmentProgressRecord[] = [];

  private inClinic(clinicId: string): TreatmentRecord[] {
    return this.treatments.filter((record) => record.clinicId.toString() === clinicId);
  }

  async findByIdInClinic(treatmentId: string, clinicId: string): Promise<TreatmentRecord | null> {
    return this.inClinic(clinicId).find((record) => record._id.toString() === treatmentId) ?? null;
  }

  async listByPatient(
    patientId: string,
    clinicId: string,
    filters: { status?: TreatmentStatus } = {},
  ): Promise<TreatmentRecord[]> {
    return this.inClinic(clinicId)
      .filter((record) => record.patientId.toString() === patientId)
      .filter((record) => filters.status === undefined || record.status === filters.status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findOccupyingForPatient(
    patientId: string,
    clinicId: string,
  ): Promise<TreatmentRecord | null> {
    return (
      this.inClinic(clinicId).find(
        (record) =>
          record.patientId.toString() === patientId &&
          OCCUPYING_TREATMENT_STATUSES.includes(record.status),
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
      treatmentType: input.treatmentType,
      status: input.status ?? TREATMENT_STATUSES.PLANNED,
      startDate: input.startDate ?? null,
      expectedEndDate: input.expectedEndDate ?? null,
      actualEndDate: null,
      notes: input.notes ?? null,
      totalPlannedCost: input.totalPlannedCost ?? null,
      cancellationReason: null,
      createdBy: new Types.ObjectId(input.createdBy),
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    this.treatments.push(record);
    return record;
  }

  async update(
    treatmentId: string,
    clinicId: string,
    changes: UpdateTreatmentFields,
  ): Promise<TreatmentRecord | null> {
    const record = await this.findByIdInClinic(treatmentId, clinicId);
    if (!record) return null;

    if (changes.treatmentType !== undefined) record.treatmentType = changes.treatmentType;
    if (changes.startDate !== undefined) record.startDate = changes.startDate;
    if (changes.expectedEndDate !== undefined) record.expectedEndDate = changes.expectedEndDate;
    if (changes.notes !== undefined) record.notes = changes.notes;
    if (changes.totalPlannedCost !== undefined) record.totalPlannedCost = changes.totalPlannedCost;
    record.updatedBy = new Types.ObjectId(changes.updatedBy);
    record.updatedAt = new Date();
    return record;
  }

  /** `expectedFrom` is part of the match, exactly as it is in the Mongo filter. */
  async changeStatus(
    treatmentId: string,
    clinicId: string,
    expectedFrom: TreatmentStatus,
    changes: TreatmentStatusChangeFields,
  ): Promise<TreatmentRecord | null> {
    const record = await this.findByIdInClinic(treatmentId, clinicId);
    if (!record || record.status !== expectedFrom) return null;

    record.status = changes.status;
    if (changes.startDate !== undefined) record.startDate = changes.startDate;
    if (changes.actualEndDate !== undefined) record.actualEndDate = changes.actualEndDate;
    if (changes.cancellationReason !== undefined) {
      record.cancellationReason = changes.cancellationReason;
    }
    record.updatedBy = new Types.ObjectId(changes.updatedBy);
    record.updatedAt = new Date();
    return record;
  }

  async createProgress(input: CreateTreatmentProgressInput): Promise<TreatmentProgressRecord> {
    const now = new Date();
    const record: TreatmentProgressRecord = {
      _id: new Types.ObjectId(),
      clinicId: new Types.ObjectId(input.clinicId),
      patientId: new Types.ObjectId(input.patientId),
      treatmentId: new Types.ObjectId(input.treatmentId),
      occurredAt: input.occurredAt,
      type: input.type,
      note: input.note ?? null,
      createdBy: new Types.ObjectId(input.createdBy),
      createdAt: now,
      updatedAt: now,
    };
    this.progress.push(record);
    return record;
  }

  async listProgressByTreatment(
    treatmentId: string,
    clinicId: string,
    pagination: { skip: number; limit: number },
  ) {
    const items = this.progress
      .filter(
        (entry) =>
          entry.clinicId.toString() === clinicId && entry.treatmentId.toString() === treatmentId,
      )
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    return {
      items: items.slice(pagination.skip, pagination.skip + pagination.limit),
      total: items.length,
    };
  }

  async listProgressByTreatmentIds(
    treatmentIds: string[],
    clinicId: string,
  ): Promise<TreatmentProgressRecord[]> {
    return this.progress.filter(
      (entry) =>
        entry.clinicId.toString() === clinicId &&
        treatmentIds.includes(entry.treatmentId.toString()),
    );
  }
}

class FakePatientRepository {
  patients = new Map<string, { clinicId: string; status: PatientStatus }>();

  async findByIdInClinic(patientId: string, clinicId: string) {
    const patient = this.patients.get(patientId);
    if (!patient || patient.clinicId !== clinicId) return null;
    return {
      _id: new Types.ObjectId(patientId),
      clinicId: new Types.ObjectId(clinicId),
      status: patient.status,
    };
  }
}

class FakeMembershipRepository {
  ownerByClinic = new Map<string, string>();

  async findActiveOwner(clinicId: string) {
    const userId = this.ownerByClinic.get(clinicId);
    return userId ? { userId: new Types.ObjectId(userId) } : null;
  }
}

class FakeAuditLogService {
  events: { action: string; metadata?: Record<string, unknown> }[] = [];

  async record(input: { action: string; metadata?: Record<string, unknown> }): Promise<void> {
    this.events.push(input);
  }
}

describe('TreatmentService', () => {
  let treatments: FakeTreatmentRepository;
  let patients: FakePatientRepository;
  let memberships: FakeMembershipRepository;
  let audit: FakeAuditLogService;
  let service: TreatmentService;

  beforeEach(() => {
    treatments = new FakeTreatmentRepository();
    patients = new FakePatientRepository();
    memberships = new FakeMembershipRepository();
    audit = new FakeAuditLogService();

    patients.patients.set(PATIENT_ID, { clinicId: CLINIC_A, status: PATIENT_STATUSES.ACTIVE });
    patients.patients.set(OTHER_PATIENT_ID, {
      clinicId: CLINIC_A,
      status: PATIENT_STATUSES.ACTIVE,
    });
    memberships.ownerByClinic.set(CLINIC_A, OWNER_ID);
    memberships.ownerByClinic.set(CLINIC_B, OWNER_ID);

    service = new TreatmentService(
      treatments as unknown as TreatmentRepository,
      patients as unknown as PatientRepository,
      memberships as unknown as MembershipRepository,
      audit as unknown as AuditLogService,
    );
  });

  async function planTreatment(patientId = PATIENT_ID) {
    return service.create(CLINIC_A, patientId, { treatmentType: 'Fixed braces' }, ACTOR);
  }

  async function startedTreatment(startDate?: string) {
    const planned = await planTreatment();
    await service.start(CLINIC_A, planned.id, startDate ? { startDate } : {}, ACTOR);
    return planned;
  }

  describe('transition table', () => {
    it('allows only forward moves out of PLANNED', () => {
      expect(canTransitionTreatment(TREATMENT_STATUSES.PLANNED, TREATMENT_STATUSES.ACTIVE)).toBe(
        true,
      );
      expect(canTransitionTreatment(TREATMENT_STATUSES.PLANNED, TREATMENT_STATUSES.CANCELLED)).toBe(
        true,
      );
      expect(canTransitionTreatment(TREATMENT_STATUSES.PLANNED, TREATMENT_STATUSES.PAUSED)).toBe(
        false,
      );
      expect(canTransitionTreatment(TREATMENT_STATUSES.PLANNED, TREATMENT_STATUSES.COMPLETED)).toBe(
        false,
      );
    });

    it('treats COMPLETED and CANCELLED as terminal', () => {
      for (const target of Object.values(TREATMENT_STATUSES)) {
        expect(canTransitionTreatment(TREATMENT_STATUSES.COMPLETED, target)).toBe(false);
        expect(canTransitionTreatment(TREATMENT_STATUSES.CANCELLED, target)).toBe(false);
      }
    });
  });

  describe('create', () => {
    it('plans a treatment without starting it', async () => {
      const treatment = await planTreatment();

      expect(treatment.status).toBe(TREATMENT_STATUSES.PLANNED);
      expect(treatment.startDate).toBeNull();
      expect(treatment.isCurrent).toBe(false);
      // Nothing has happened clinically yet, so the timeline stays empty.
      expect(treatments.progress).toHaveLength(0);
      expect(audit.events.map((event) => event.action)).toEqual(['treatment.created']);
    });

    it('resolves the doctor from the clinic owner, never from the caller', async () => {
      const treatment = await planTreatment();
      expect(treatment.doctorId).toBe(OWNER_ID);
    });

    it('refuses to plan care for a patient in another clinic', async () => {
      await expectRejection(
        service.create(CLINIC_B, PATIENT_ID, { treatmentType: 'Retainer' }, ACTOR),
        ERROR_CODES.PATIENT_NOT_FOUND,
      );
    });

    it('refuses to plan care for an archived patient', async () => {
      patients.patients.set(PATIENT_ID, {
        clinicId: CLINIC_A,
        status: PATIENT_STATUSES.ARCHIVED,
      });

      await expectRejection(planTreatment(), ERROR_CODES.TREATMENT_PATIENT_ARCHIVED);
    });

    it('rejects an expected end date before the start date', async () => {
      await expectRejection(
        service.create(
          CLINIC_A,
          PATIENT_ID,
          {
            treatmentType: 'Clear aligners',
            startDate: '2026-03-01',
            expectedEndDate: '2026-02-01',
          },
          ACTOR,
        ),
        ERROR_CODES.TREATMENT_INVALID_DATE_RANGE,
      );
    });

    it('starts care immediately when created ACTIVE and logs the start', async () => {
      const treatment = await service.create(
        CLINIC_A,
        PATIENT_ID,
        { treatmentType: 'Clear aligners', status: 'ACTIVE' },
        ACTOR,
      );

      expect(treatment.status).toBe(TREATMENT_STATUSES.ACTIVE);
      expect(treatment.startDate).not.toBeNull();
      expect(treatment.isCurrent).toBe(true);
      expect(treatments.progress.map((entry) => entry.type)).toEqual([
        TREATMENT_EVENT_TYPES.STARTED,
      ]);
    });

    it('refuses a second ACTIVE course for the same patient', async () => {
      await service.create(
        CLINIC_A,
        PATIENT_ID,
        { treatmentType: 'Fixed braces', status: 'ACTIVE' },
        ACTOR,
      );

      await expectRejection(
        service.create(
          CLINIC_A,
          PATIENT_ID,
          { treatmentType: 'Clear aligners', status: 'ACTIVE' },
          ACTOR,
        ),
        ERROR_CODES.TREATMENT_ALREADY_ACTIVE,
      );
    });

    it('still allows a PLANNED follow-up while a course is running', async () => {
      await service.create(
        CLINIC_A,
        PATIENT_ID,
        { treatmentType: 'Fixed braces', status: 'ACTIVE' },
        ACTOR,
      );

      const followUp = await planTreatment();
      expect(followUp.status).toBe(TREATMENT_STATUSES.PLANNED);
    });

    it('does not constrain a different patient in the same clinic', async () => {
      await service.create(
        CLINIC_A,
        PATIENT_ID,
        { treatmentType: 'Fixed braces', status: 'ACTIVE' },
        ACTOR,
      );

      const other = await service.create(
        CLINIC_A,
        OTHER_PATIENT_ID,
        { treatmentType: 'Retainer', status: 'ACTIVE' },
        ACTOR,
      );
      expect(other.status).toBe(TREATMENT_STATUSES.ACTIVE);
    });

    it('refuses when the clinic has no active owner-doctor', async () => {
      memberships.ownerByClinic.delete(CLINIC_A);

      await expectRejection(planTreatment(), ERROR_CODES.CLINIC_HAS_NO_DOCTOR);
    });
  });

  describe('lifecycle', () => {
    it('starts a planned treatment and records a STARTED event', async () => {
      const treatment = await startedTreatment();
      const started = await service.getById(CLINIC_A, treatment.id);

      expect(started.status).toBe(TREATMENT_STATUSES.ACTIVE);
      expect(started.startDate).not.toBeNull();
      expect(treatments.progress.map((entry) => entry.type)).toEqual([
        TREATMENT_EVENT_TYPES.STARTED,
      ]);
      expect(audit.events.map((event) => event.action)).toEqual([
        'treatment.created',
        'treatment.started',
      ]);
    });

    it('refuses to start a second course while another is running', async () => {
      await service.create(
        CLINIC_A,
        PATIENT_ID,
        { treatmentType: 'Fixed braces', status: 'ACTIVE' },
        ACTOR,
      );
      const planned = await planTreatment();

      await expectRejection(
        service.start(CLINIC_A, planned.id, {}, ACTOR),
        ERROR_CODES.TREATMENT_ALREADY_ACTIVE,
      );
    });

    it('pauses and resumes, keeping the patient slot occupied throughout', async () => {
      const treatment = await startedTreatment();

      const paused = await service.pause(CLINIC_A, treatment.id, { reason: 'Travelling' }, ACTOR);
      expect(paused.status).toBe(TREATMENT_STATUSES.PAUSED);
      // PAUSED still occupies the slot — no second course may open alongside it.
      expect(paused.isCurrent).toBe(true);

      const resumed = await service.resume(CLINIC_A, treatment.id, {}, ACTOR);
      expect(resumed.status).toBe(TREATMENT_STATUSES.ACTIVE);
      expect(audit.events.map((event) => event.action)).toEqual([
        'treatment.created',
        'treatment.started',
        'treatment.paused',
        'treatment.resumed',
      ]);
      expect(treatments.progress.map((entry) => entry.type)).toEqual([
        TREATMENT_EVENT_TYPES.STARTED,
        TREATMENT_EVENT_TYPES.PAUSED,
        TREATMENT_EVENT_TYPES.RESUMED,
      ]);
    });

    it('refuses to pause a treatment that never started', async () => {
      const planned = await planTreatment();

      await expectRejection(
        service.pause(CLINIC_A, planned.id, {}, ACTOR),
        ERROR_CODES.TREATMENT_INVALID_STATUS_TRANSITION,
      );
    });

    it('completes a treatment and frees the patient slot', async () => {
      const treatment = await startedTreatment('2026-01-05');

      const completed = await service.complete(
        CLINIC_A,
        treatment.id,
        { actualEndDate: '2026-07-05' },
        ACTOR,
      );

      expect(completed.status).toBe(TREATMENT_STATUSES.COMPLETED);
      expect(completed.actualEndDate).toBe('2026-07-05');
      expect(completed.durationDays).toBe(181);
      expect(completed.isCurrent).toBe(false);

      // The slot is free again, so a new course can be started.
      const next = await service.create(
        CLINIC_A,
        PATIENT_ID,
        { treatmentType: 'Retainer', status: 'ACTIVE' },
        ACTOR,
      );
      expect(next.status).toBe(TREATMENT_STATUSES.ACTIVE);
    });

    it('rejects an end date before the start date', async () => {
      const treatment = await startedTreatment('2026-05-01');

      await expectRejection(
        service.complete(CLINIC_A, treatment.id, { actualEndDate: '2026-04-01' }, ACTOR),
        ERROR_CODES.TREATMENT_INVALID_DATE_RANGE,
      );
    });

    it('refuses any move out of a completed treatment', async () => {
      const treatment = await startedTreatment();
      await service.complete(CLINIC_A, treatment.id, {}, ACTOR);

      await expectRejection(
        service.resume(CLINIC_A, treatment.id, {}, ACTOR),
        ERROR_CODES.TREATMENT_INVALID_STATUS_TRANSITION,
      );
      await expectRejection(
        service.cancel(CLINIC_A, treatment.id, { reason: 'Changed mind' }, ACTOR),
        ERROR_CODES.TREATMENT_INVALID_STATUS_TRANSITION,
      );
    });

    it('cancels a planned treatment and keeps the reason', async () => {
      const planned = await planTreatment();
      const cancelled = await service.cancel(
        CLINIC_A,
        planned.id,
        { reason: 'Patient moved abroad' },
        ACTOR,
      );

      expect(cancelled.status).toBe(TREATMENT_STATUSES.CANCELLED);
      expect(cancelled.cancellationReason).toBe('Patient moved abroad');
      expect(cancelled.isCurrent).toBe(false);
    });
  });

  describe('update', () => {
    it('edits plan fields on a live treatment', async () => {
      const planned = await planTreatment();
      const updated = await service.update(
        CLINIC_A,
        planned.id,
        { treatmentType: 'Clear aligners', totalPlannedCost: 3200 },
        ACTOR,
      );

      expect(updated.treatmentType).toBe('Clear aligners');
      expect(updated.totalPlannedCost).toBe(3200);
      expect(updated.updatedBy).toBe(OWNER_ID);
    });

    it('records only field names in the audit trail, never clinical content', async () => {
      const planned = await planTreatment();
      await service.update(CLINIC_A, planned.id, { notes: 'Class II, deep bite' }, ACTOR);

      const serialized = JSON.stringify(audit.events);
      expect(serialized).toContain('notes');
      expect(serialized).not.toContain('deep bite');
    });

    it('refuses to edit a closed treatment', async () => {
      const planned = await planTreatment();
      await service.cancel(CLINIC_A, planned.id, { reason: 'Duplicate record' }, ACTOR);

      await expectRejection(
        service.update(CLINIC_A, planned.id, { treatmentType: 'Retainer' }, ACTOR),
        ERROR_CODES.TREATMENT_ALREADY_CLOSED,
      );
    });
  });

  describe('progress', () => {
    it('records a chairside entry against a running treatment', async () => {
      const treatment = await startedTreatment();

      const entry = await service.addProgress(
        CLINIC_A,
        treatment.id,
        { type: TREATMENT_EVENT_TYPES.ADJUSTMENT, note: 'Wire upsized to 016' },
        ACTOR,
      );

      expect(entry.type).toBe(TREATMENT_EVENT_TYPES.ADJUSTMENT);
      expect(entry.treatmentId).toBe(treatment.id);
      expect(audit.events.at(-1)?.action).toBe('treatment.progress_added');
    });

    it('refuses an entry dated in the future', async () => {
      const planned = await planTreatment();
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await expectRejection(
        service.addProgress(
          CLINIC_A,
          planned.id,
          { type: TREATMENT_EVENT_TYPES.NOTE, occurredAt: tomorrow },
          ACTOR,
        ),
        ERROR_CODES.TREATMENT_INVALID_DATE_RANGE,
      );
    });

    it('refuses an entry on a closed treatment', async () => {
      const planned = await planTreatment();
      await service.cancel(CLINIC_A, planned.id, { reason: 'Not proceeding' }, ACTOR);

      await expectRejection(
        service.addProgress(CLINIC_A, planned.id, { type: TREATMENT_EVENT_TYPES.NOTE }, ACTOR),
        ERROR_CODES.TREATMENT_ALREADY_CLOSED,
      );
    });

    it('paginates a treatment timeline, newest first', async () => {
      const treatment = await startedTreatment();
      await service.addProgress(
        CLINIC_A,
        treatment.id,
        { type: TREATMENT_EVENT_TYPES.CHECKPOINT, occurredAt: '2026-02-01T10:00:00.000Z' },
        ACTOR,
      );

      const { result } = await service.listProgress(CLINIC_A, treatment.id, { page: 1, limit: 1 });
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('tenant isolation', () => {
    it('hides a treatment from another clinic behind a 404', async () => {
      const planned = await planTreatment();

      await expectRejection(service.getById(CLINIC_B, planned.id), ERROR_CODES.TREATMENT_NOT_FOUND);
    });

    it('refuses lifecycle changes from another clinic', async () => {
      const planned = await planTreatment();

      await expectRejection(
        service.start(CLINIC_B, planned.id, {}, ACTOR),
        ERROR_CODES.TREATMENT_NOT_FOUND,
      );
    });

    it('returns the patient history with timelines attached', async () => {
      const treatment = await startedTreatment();
      await service.addProgress(
        CLINIC_A,
        treatment.id,
        { type: TREATMENT_EVENT_TYPES.CHECKPOINT },
        ACTOR,
      );

      const history = await service.listForPatient(CLINIC_A, PATIENT_ID);
      expect(history).toHaveLength(1);
      expect(history[0]?.progress).toHaveLength(2);
      expect(history[0]?.isCurrent).toBe(true);
    });
  });
});

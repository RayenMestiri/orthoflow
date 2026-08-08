import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../src/common/constants/error-codes.js';
import { AppError } from '../../src/common/errors/app-error.js';
import { toWallClock } from '../../src/common/utils/clinic-time.js';
import type { MutationContext } from '../../src/common/utils/request-context.js';
import { AppointmentService } from '../../src/modules/appointments/appointment.service.js';
import {
  DEFAULT_CLINIC_SETTINGS,
  type ClinicSchedulingSettings,
} from '../../src/modules/clinics/clinic-settings.types.js';
import {
  APPOINTMENT_STATUSES,
  CAPACITY_CONSUMING_APPOINTMENT_STATUSES,
  canTransition,
  type AppointmentRecord,
  type AppointmentStatus,
} from '../../src/modules/appointments/appointment.types.js';

const CLINIC_A = '652f1c9b8a1e4f0012ab34cd';
const CLINIC_B = '652f1c9b8a1e4f0012ab99ff';
const DOCTOR_ID = '652f1c9b8a1e4f0012ab0001';
const PATIENT_ID = '652f1c9b8a1e4f0012abaaaa';
const TYPE_ID = '652f1c9b8a1e4f0012abcccc';
const ACTOR: MutationContext = { actorUserId: DOCTOR_ID, ip: null, userAgent: null };

/** Monday 2026-08-10. Tunisia is UTC+1 year-round, so 08:00Z = 09:00 local. */
const MONDAY_9_LOCAL = new Date('2026-08-10T08:00:00.000Z');
const SUNDAY_9_LOCAL = new Date('2026-08-09T08:00:00.000Z');

function expectCode(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

/**
 * In-memory appointment store mirroring the repository contract, including the
 * overlap predicate (`startAt < end && endAt > start`, blocking statuses only).
 */
class FakeAppointmentRepository {
  records: AppointmentRecord[] = [];

  private materialize(input: {
    clinicId: string;
    patientId: string;
    doctorId: string;
    appointmentTypeId: string;
    startAt: Date;
    endAt: Date;
    durationMinutes: number;
    status?: AppointmentStatus;
    note?: string | null;
    overbookingOverride?: boolean;
    overbookingApprovedBy?: string | null;
    createdBy: string;
  }): AppointmentRecord {
    return {
      _id: new Types.ObjectId(),
      clinicId: new Types.ObjectId(input.clinicId),
      patientId: new Types.ObjectId(input.patientId),
      doctorId: new Types.ObjectId(input.doctorId),
      appointmentTypeId: new Types.ObjectId(input.appointmentTypeId),
      startAt: input.startAt,
      endAt: input.endAt,
      durationMinutes: input.durationMinutes,
      status: input.status ?? APPOINTMENT_STATUSES.SCHEDULED,
      note: input.note ?? null,
      cancellationReason: null,
      cancelledAt: null,
      cancelledBy: null,
      arrivedAt: null,
      treatmentStartedAt: null,
      completedAt: null,
      noShowAt: null,
      markedNoShowBy: null,
      overbookingOverride: input.overbookingOverride ?? false,
      overbookingApprovedBy: input.overbookingApprovedBy
        ? new Types.ObjectId(input.overbookingApprovedBy)
        : null,
      createdBy: new Types.ObjectId(input.createdBy),
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async create(input: Parameters<FakeAppointmentRepository['materialize']>[0]) {
    const record = this.materialize(input);
    this.records.push(record);
    return record;
  }

  async findByIdInClinic(appointmentId: string, clinicId: string) {
    return (
      this.records.find(
        (record) =>
          record._id.toString() === appointmentId && record.clinicId.toString() === clinicId,
      ) ?? null
    );
  }

  async listCapacityOverlaps(
    clinicId: string,
    doctorId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ) {
    return this.records.filter(
      (record) =>
        record.clinicId.toString() === clinicId &&
        record.doctorId.toString() === doctorId &&
        CAPACITY_CONSUMING_APPOINTMENT_STATUSES.includes(record.status) &&
        record.startAt.getTime() < endAt.getTime() &&
        record.endAt.getTime() > startAt.getTime() &&
        record._id.toString() !== excludeId,
    );
  }

  async listInRange(clinicId: string, query: { start: Date; end: Date }) {
    return this.records.filter(
      (record) =>
        record.clinicId.toString() === clinicId &&
        record.startAt.getTime() < query.end.getTime() &&
        record.endAt.getTime() > query.start.getTime(),
    );
  }

  async updateFields(
    appointmentId: string,
    clinicId: string,
    changes: Record<string, unknown> & { startAt?: Date; endAt?: Date; durationMinutes?: number },
  ) {
    const record = await this.findByIdInClinic(appointmentId, clinicId);
    if (!record) return null;
    Object.assign(record, changes, { updatedAt: new Date() });
    return record;
  }

  async transitionStatus(
    appointmentId: string,
    clinicId: string,
    fromStatus: AppointmentStatus,
    toStatus: AppointmentStatus,
    _updatedBy: string,
    cancellation?: { reason: string | null },
  ) {
    const record = await this.findByIdInClinic(appointmentId, clinicId);
    if (!record || record.status !== fromStatus) return null;
    record.status = toStatus;
    if (cancellation) {
      record.cancellationReason = cancellation.reason;
      record.cancelledAt = new Date();
      record.cancelledBy = new Types.ObjectId(DOCTOR_ID);
    }
    return record;
  }

  async countInRange() {
    return this.records.length;
  }
}

function appointmentTypeRecord(overrides: Partial<{ durationMinutes: number }> = {}) {
  return {
    _id: new Types.ObjectId(TYPE_ID),
    clinicId: new Types.ObjectId(CLINIC_A),
    name: 'Monthly control',
    durationMinutes: overrides.durationMinutes ?? 15,
    color: '#2D765F',
    description: null,
    isActive: true,
    createdBy: new Types.ObjectId(DOCTOR_ID),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function patientRecordIn(clinicId: string) {
  return {
    _id: new Types.ObjectId(PATIENT_ID),
    clinicId: new Types.ObjectId(clinicId),
    firstName: 'Yasmine',
    lastName: 'Trabelsi',
    birthDate: new Date('2014-03-21'),
    phone: '+216 20 123 456',
    status: 'ACTIVE',
  };
}

interface Fakes {
  service: AppointmentService;
  store: FakeAppointmentRepository;
  patients: {
    findByIdInClinic: ReturnType<typeof vi.fn>;
    findManyByIdsInClinic: ReturnType<typeof vi.fn>;
  };
  memberships: { findActiveOwner: ReturnType<typeof vi.fn> };
  audit: { record: ReturnType<typeof vi.fn> };
}

function buildService(scheduling: Partial<ClinicSchedulingSettings> = {}): Fakes {
  const store = new FakeAppointmentRepository();
  const typeRecord = appointmentTypeRecord();

  const patients = {
    findByIdInClinic: vi.fn(async (_patientId: string, clinicId: string) =>
      // The patient exists only in clinic A — asking from clinic B finds nothing,
      // exactly like the tenancy-scoped Mongo filter.
      clinicId === CLINIC_A ? patientRecordIn(clinicId) : null,
    ),
    findManyByIdsInClinic: vi.fn(async (_ids: string[], clinicId: string) =>
      clinicId === CLINIC_A ? [patientRecordIn(clinicId)] : [],
    ),
  };
  const types = {
    findByIdInClinic: vi.fn(async () => typeRecord),
    findManyByIdsInClinic: vi.fn(async () => [typeRecord]),
  };
  const typeService = {
    requireBookable: vi.fn(async (clinicId: string, _typeId: string) => {
      if (clinicId !== CLINIC_A) {
        throw new AppError(404, ERROR_CODES.APPOINTMENT_TYPE_NOT_FOUND, 'not found');
      }
      return typeRecord;
    }),
  };
  const clinics = {
    findById: vi.fn(async (clinicId: string) => ({
      _id: new Types.ObjectId(clinicId),
      name: 'Cabinet Al Amal',
      timezone: 'Africa/Tunis',
      settings: {
        ...DEFAULT_CLINIC_SETTINGS,
        scheduling: { ...DEFAULT_CLINIC_SETTINGS.scheduling, ...scheduling },
      },
      status: 'ACTIVE',
    })),
  };
  const memberships = {
    findActiveOwner: vi.fn(async () => ({
      userId: new Types.ObjectId(DOCTOR_ID),
      clinicId: new Types.ObjectId(CLINIC_A),
    })),
  };
  const audit = { record: vi.fn(async () => undefined) };

  const service = new AppointmentService(
    store as never,
    types as never,
    typeService as never,
    patients as never,
    clinics as never,
    memberships as never,
    audit as never,
  );

  return { service, store, patients, memberships, audit };
}

describe('clinic wall-clock conversion', () => {
  it('shows 09:00 Monday in Tunis for 08:00Z', () => {
    const clock = toWallClock(MONDAY_9_LOCAL, 'Africa/Tunis');
    expect(clock).toEqual({ weekday: 1, time: '09:00', minutesOfDay: 540 });
  });

  it('survives serialization round-trips without drifting an hour', () => {
    const reparsed = new Date(MONDAY_9_LOCAL.toISOString());
    expect(toWallClock(reparsed, 'Africa/Tunis').time).toBe('09:00');
  });
});

describe('status transition rules', () => {
  it('follows the operational happy path', () => {
    expect(canTransition('SCHEDULED', 'CONFIRMED')).toBe(true);
    expect(canTransition('CONFIRMED', 'ARRIVED')).toBe(true);
    expect(canTransition('ARRIVED', 'WAITING')).toBe(true);
    expect(canTransition('WAITING', 'IN_TREATMENT')).toBe(true);
    expect(canTransition('IN_TREATMENT', 'COMPLETED')).toBe(true);
  });

  it('lets a walk-in skip forward but never move backwards', () => {
    expect(canTransition('SCHEDULED', 'IN_TREATMENT')).toBe(true);
    expect(canTransition('ARRIVED', 'CONFIRMED')).toBe(false);
    expect(canTransition('IN_TREATMENT', 'WAITING')).toBe(false);
  });

  it('makes terminal states final', () => {
    for (const from of ['COMPLETED', 'NO_SHOW', 'CANCELLED'] as const) {
      for (const to of Object.values(APPOINTMENT_STATUSES)) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it('cannot no-show a patient who is already in the clinic', () => {
    expect(canTransition('ARRIVED', 'NO_SHOW')).toBe(false);
    expect(canTransition('WAITING', 'NO_SHOW')).toBe(false);
    expect(canTransition('IN_TREATMENT', 'NO_SHOW')).toBe(false);
  });
});

describe('AppointmentService.create', () => {
  let fakes: Fakes;

  beforeEach(() => {
    fakes = buildService();
  });

  it('derives the duration and end time from the appointment type', async () => {
    const dto = await fakes.service.create(
      CLINIC_A,
      { patientId: PATIENT_ID, appointmentTypeId: TYPE_ID, startAt: MONDAY_9_LOCAL },
      ACTOR,
    );

    expect(dto.durationMinutes).toBe(15);
    expect(dto.endAt).toBe('2026-08-10T08:15:00.000Z');
    expect(dto.status).toBe('SCHEDULED');
    expect(dto.patient?.fullName).toBe('Yasmine Trabelsi');
    expect(fakes.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appointment.created' }),
    );
  });

  it('resolves the doctor from the clinic owner, never from the caller', async () => {
    const dto = await fakes.service.create(
      CLINIC_A,
      { patientId: PATIENT_ID, appointmentTypeId: TYPE_ID, startAt: MONDAY_9_LOCAL },
      ACTOR,
    );

    expect(fakes.memberships.findActiveOwner).toHaveBeenCalledWith(CLINIC_A);
    expect(dto.doctorId).toBe(DOCTOR_ID);
  });

  it('accepts two overlaps and asks for explicit owner approval for the third', async () => {
    await fakes.service.create(
      CLINIC_A,
      {
        patientId: PATIENT_ID,
        appointmentTypeId: TYPE_ID,
        startAt: MONDAY_9_LOCAL,
        durationMinutes: 30,
      },
      ACTOR,
    );

    await expect(
      fakes.service.create(
        CLINIC_A,
        {
          patientId: PATIENT_ID,
          appointmentTypeId: TYPE_ID,
          startAt: new Date('2026-08-10T08:15:00.000Z'),
          durationMinutes: 30,
        },
        ACTOR,
      ),
    ).resolves.toMatchObject({ status: 'SCHEDULED' });

    try {
      await fakes.service.create(
        CLINIC_A,
        {
          patientId: PATIENT_ID,
          appointmentTypeId: TYPE_ID,
          startAt: new Date('2026-08-10T08:15:00.000Z'),
          durationMinutes: 30,
        },
        ACTOR,
      );
      expect.unreachable('should have requested overbooking confirmation');
    } catch (error) {
      expectCode(error, ERROR_CODES.SLOT_CAPACITY_EXCEEDED);
      expect((error as AppError).statusCode).toBe(422);
      expect((error as AppError).details).toMatchObject({
        requiresConfirmation: true,
        recommendedCapacity: 2,
        overrideAllowed: true,
      });
    }

    await expect(
      fakes.service.create(
        CLINIC_A,
        {
          patientId: PATIENT_ID,
          appointmentTypeId: TYPE_ID,
          startAt: new Date('2026-08-10T08:15:00.000Z'),
          durationMinutes: 30,
          allowOverbooking: true,
        },
        ACTOR,
      ),
    ).resolves.toMatchObject({ overbookingOverride: true });
  });

  it('frees the slot again once the blocking appointment is cancelled', async () => {
    const first = await fakes.service.create(
      CLINIC_A,
      {
        patientId: PATIENT_ID,
        appointmentTypeId: TYPE_ID,
        startAt: MONDAY_9_LOCAL,
        durationMinutes: 30,
      },
      ACTOR,
    );
    await fakes.service.cancel(CLINIC_A, first.id, 'Patient called', ACTOR);

    await expect(
      fakes.service.create(
        CLINIC_A,
        { patientId: PATIENT_ID, appointmentTypeId: TYPE_ID, startAt: MONDAY_9_LOCAL },
        ACTOR,
      ),
    ).resolves.toMatchObject({ status: 'SCHEDULED' });
  });

  it('rejects a start before the clinic opens', async () => {
    // 07:00 local — the default pattern opens at 08:00.
    try {
      await fakes.service.create(
        CLINIC_A,
        {
          patientId: PATIENT_ID,
          appointmentTypeId: TYPE_ID,
          startAt: new Date('2026-08-10T06:00:00.000Z'),
        },
        ACTOR,
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expectCode(error, ERROR_CODES.APPOINTMENT_OUTSIDE_WORKING_HOURS);
    }
  });

  it('rejects a Sunday appointment because the clinic is closed', async () => {
    try {
      await fakes.service.create(
        CLINIC_A,
        { patientId: PATIENT_ID, appointmentTypeId: TYPE_ID, startAt: SUNDAY_9_LOCAL },
        ACTOR,
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expectCode(error, ERROR_CODES.APPOINTMENT_OUTSIDE_WORKING_HOURS);
    }
  });

  it('rejects appointments in the lunch break between split shifts', async () => {
    await expect(
      fakes.service.create(
        CLINIC_A,
        {
          patientId: PATIENT_ID,
          appointmentTypeId: TYPE_ID,
          // 12:30 local, between the 08:00–12:00 and 14:00–18:00 periods.
          startAt: new Date('2026-08-10T11:30:00.000Z'),
        },
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.APPOINTMENT_OUTSIDE_WORKING_HOURS });
  });

  it('enforces the configured slot precision', async () => {
    fakes = buildService({ slotIntervalMinutes: 20 });
    await expect(
      fakes.service.create(
        CLINIC_A,
        {
          patientId: PATIENT_ID,
          appointmentTypeId: TYPE_ID,
          // 09:10 local is not on a 20-minute boundary.
          startAt: new Date('2026-08-10T08:10:00.000Z'),
        },
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.APPOINTMENT_INVALID_TIME_RANGE });
  });

  it('never permits an explicit override when owner overbooking is disabled', async () => {
    fakes = buildService({ defaultConcurrentCapacity: 1, allowOwnerOverbooking: false });
    await fakes.service.create(
      CLINIC_A,
      { patientId: PATIENT_ID, appointmentTypeId: TYPE_ID, startAt: MONDAY_9_LOCAL },
      ACTOR,
    );

    await expect(
      fakes.service.create(
        CLINIC_A,
        { patientId: PATIENT_ID, appointmentTypeId: TYPE_ID, startAt: MONDAY_9_LOCAL },
        ACTOR,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.SLOT_CAPACITY_EXCEEDED,
      details: expect.objectContaining({ overrideAllowed: false }),
    });

    await expect(
      fakes.service.create(
        CLINIC_A,
        {
          patientId: PATIENT_ID,
          appointmentTypeId: TYPE_ID,
          startAt: MONDAY_9_LOCAL,
          allowOverbooking: true,
        },
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.APPOINTMENT_OVERBOOKING_NOT_ALLOWED });
  });

  it('accepts an appointment ending exactly at closing time', async () => {
    // Monday closes 18:00 local = 17:00Z. 17:45–18:00 local is the last slot.
    await expect(
      fakes.service.create(
        CLINIC_A,
        {
          patientId: PATIENT_ID,
          appointmentTypeId: TYPE_ID,
          startAt: new Date('2026-08-10T16:45:00.000Z'),
        },
        ACTOR,
      ),
    ).resolves.toMatchObject({ durationMinutes: 15 });
  });

  it('answers 404 for a patient that belongs to another clinic', async () => {
    try {
      await fakes.service.create(
        CLINIC_B,
        { patientId: PATIENT_ID, appointmentTypeId: TYPE_ID, startAt: MONDAY_9_LOCAL },
        ACTOR,
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as AppError).statusCode).toBe(404);
    }
  });
});

describe('AppointmentService workflow', () => {
  let fakes: Fakes;
  let appointmentId: string;

  beforeEach(async () => {
    fakes = buildService();
    const dto = await fakes.service.create(
      CLINIC_A,
      { patientId: PATIENT_ID, appointmentTypeId: TYPE_ID, startAt: MONDAY_9_LOCAL },
      ACTOR,
    );
    appointmentId = dto.id;
  });

  it('walks the full front-desk flow to completion', async () => {
    for (const status of [
      'CONFIRMED',
      'ARRIVED',
      'WAITING',
      'IN_TREATMENT',
      'COMPLETED',
    ] as const) {
      const dto = await fakes.service.changeStatus(CLINIC_A, appointmentId, status, ACTOR);
      expect(dto.status).toBe(status);
    }
  });

  it('rejects an invalid transition with a business error', async () => {
    await fakes.service.changeStatus(CLINIC_A, appointmentId, 'ARRIVED', ACTOR);
    try {
      await fakes.service.changeStatus(CLINIC_A, appointmentId, 'NO_SHOW', ACTOR);
      expect.unreachable('should have thrown');
    } catch (error) {
      expectCode(error, ERROR_CODES.APPOINTMENT_INVALID_STATUS_TRANSITION);
    }
  });

  it('stores the cancellation reason and audit trail without deleting', async () => {
    const dto = await fakes.service.cancel(CLINIC_A, appointmentId, 'Family emergency', ACTOR);

    expect(dto.status).toBe('CANCELLED');
    expect(dto.cancellationReason).toBe('Family emergency');
    expect(dto.cancelledAt).not.toBeNull();
    expect(fakes.store.records).toHaveLength(1);
    expect(fakes.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appointment.cancelled' }),
    );
  });

  it('keeps a no-show in history and audits it under its own action', async () => {
    const dto = await fakes.service.changeStatus(CLINIC_A, appointmentId, 'NO_SHOW', ACTOR);

    expect(dto.status).toBe('NO_SHOW');
    expect(fakes.store.records[0]?.status).toBe('NO_SHOW');
    expect(fakes.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appointment.no_show' }),
    );
  });

  it('reschedules with conflict checking that ignores the moved appointment itself', async () => {
    const dto = await fakes.service.update(
      CLINIC_A,
      appointmentId,
      { startAt: new Date('2026-08-10T09:00:00.000Z') },
      ACTOR,
    );

    expect(dto.startAt).toBe('2026-08-10T09:00:00.000Z');
    expect(fakes.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appointment.rescheduled' }),
    );
  });

  it('refuses to edit a closed appointment', async () => {
    await fakes.service.changeStatus(CLINIC_A, appointmentId, 'COMPLETED', ACTOR);
    try {
      await fakes.service.update(CLINIC_A, appointmentId, { note: 'late note' }, ACTOR);
      expect.unreachable('should have thrown');
    } catch (error) {
      expectCode(error, ERROR_CODES.APPOINTMENT_ALREADY_CLOSED);
    }
  });

  it('hides appointments from another clinic behind a 404', async () => {
    try {
      await fakes.service.getById(CLINIC_B, appointmentId);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as AppError).statusCode).toBe(404);
      expectCode(error, ERROR_CODES.APPOINTMENT_NOT_FOUND);
    }
  });

  it('rejects an inverted or oversized list range', async () => {
    await expect(
      fakes.service.listInRange(CLINIC_A, {
        start: new Date('2026-08-11T00:00:00.000Z'),
        end: new Date('2026-08-10T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.APPOINTMENT_INVALID_TIME_RANGE });

    await expect(
      fakes.service.listInRange(CLINIC_A, {
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: new Date('2026-06-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.APPOINTMENT_INVALID_TIME_RANGE });
  });
});

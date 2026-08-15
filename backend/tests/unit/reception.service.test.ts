import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicRepository } from '../../src/modules/clinics/clinic.repository.js';
import type { ReceptionRepository } from '../../src/modules/reception/reception.repository.js';
import { ReceptionService } from '../../src/modules/reception/reception.service.js';
import {
  FLOW_GROUPS,
  minutesSince,
  resolveFlowGroup,
} from '../../src/modules/reception/reception.types.js';

const CLINIC_A = '652f1c9b8a1e4f0012ab34cd';

/** 10:00 Tunis on 9 August 2026 is 09:00 UTC — the clinic runs at UTC+1. */
const AT = (hhmm: string): Date => new Date(`2026-08-09T${hhmm}:00.000Z`);

function record(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    patientId: new Types.ObjectId('652f1c9b8a1e4f0012abaaaa'),
    patientFirstName: 'Ahmed',
    patientLastName: 'Ben Salah',
    appointmentTypeName: 'Monthly control',
    treatmentType: 'METAL_BRACES',
    treatmentCustomLabel: null,
    startAt: AT('09:00'),
    endAt: AT('09:15'),
    durationMinutes: 15,
    status: 'SCHEDULED',
    arrivedAt: null,
    waitingAt: null,
    treatmentStartedAt: null,
    completedAt: null,
    noShowAt: null,
    note: null,
    cancellationReason: null,
    ...overrides,
  };
}

describe('resolveFlowGroup', () => {
  const now = AT('10:00');

  it('places a patient by where they physically are', () => {
    expect(resolveFlowGroup('IN_TREATMENT', AT('09:00'), now)).toBe(FLOW_GROUPS.IN_TREATMENT);
    expect(resolveFlowGroup('WAITING', AT('09:00'), now)).toBe(FLOW_GROUPS.WAITING);
    expect(resolveFlowGroup('ARRIVED', AT('09:00'), now)).toBe(FLOW_GROUPS.ARRIVED);
    expect(resolveFlowGroup('COMPLETED', AT('09:00'), now)).toBe(FLOW_GROUPS.COMPLETED);
  });

  it('derives LATE from a start time that has passed, never from a stored flag', () => {
    expect(resolveFlowGroup('SCHEDULED', AT('09:30'), now)).toBe(FLOW_GROUPS.LATE);
    expect(resolveFlowGroup('CONFIRMED', AT('09:30'), now)).toBe(FLOW_GROUPS.LATE);
  });

  it('treats a slot that has not started as upcoming', () => {
    expect(resolveFlowGroup('SCHEDULED', AT('10:30'), now)).toBe(FLOW_GROUPS.UPCOMING);
    expect(resolveFlowGroup('CONFIRMED', AT('10:30'), now)).toBe(FLOW_GROUPS.UPCOMING);
  });

  it('never calls an arrived patient late, however overdue the slot was', () => {
    // The point of deriving lateness is that walking in clears it.
    expect(resolveFlowGroup('ARRIVED', AT('08:00'), now)).toBe(FLOW_GROUPS.ARRIVED);
    expect(resolveFlowGroup('IN_TREATMENT', AT('08:00'), now)).toBe(FLOW_GROUPS.IN_TREATMENT);
  });

  it('keeps no-shows and cancellations as visible history', () => {
    expect(resolveFlowGroup('NO_SHOW', AT('09:00'), now)).toBe(FLOW_GROUPS.CLOSED);
    expect(resolveFlowGroup('CANCELLED', AT('09:00'), now)).toBe(FLOW_GROUPS.CLOSED);
  });
});

describe('minutesSince', () => {
  it('floors to whole minutes', () => {
    expect(minutesSince(AT('09:00'), new Date('2026-08-09T09:12:59.000Z'))).toBe(12);
  });

  it('never returns a negative duration for a clock that ran backwards', () => {
    expect(minutesSince(AT('10:00'), AT('09:00'))).toBe(0);
  });

  it('returns null when there is no timestamp to measure from', () => {
    expect(minutesSince(null, AT('10:00'))).toBeNull();
  });
});

describe('ReceptionService', () => {
  let reception: { listDay: ReturnType<typeof vi.fn> };
  let clinics: { findById: ReturnType<typeof vi.fn> };
  let service: ReceptionService;

  beforeEach(() => {
    reception = { listDay: vi.fn(async () => []) };
    clinics = { findById: vi.fn(async () => ({ timezone: 'Africa/Tunis' })) };
    service = new ReceptionService(
      reception as unknown as ReceptionRepository,
      clinics as unknown as ClinicRepository,
    );
  });

  it('queries the clinic calendar day, not the UTC day', async () => {
    // 00:30 on the 10th in Tunis is still 23:30 UTC on the 9th.
    await service.getToday(CLINIC_A, new Date('2026-08-09T23:30:00.000Z'));

    const [, start, end] = reception.listDay.mock.calls[0] ?? [];
    expect((start as Date).toISOString()).toBe('2026-08-09T23:00:00.000Z');
    expect((end as Date).toISOString()).toBe('2026-08-10T23:00:00.000Z');
  });

  it('reports the clinic calendar date and timezone', async () => {
    const board = await service.getToday(CLINIC_A, new Date('2026-08-09T23:30:00.000Z'));
    // Already the 10th in Tunis.
    expect(board.date).toBe('2026-08-10');
    expect(board.timezone).toBe('Africa/Tunis');
  });

  it('orders the board by operational priority, not by appointment time', async () => {
    reception.listDay.mockResolvedValueOnce([
      record({ status: 'SCHEDULED', startAt: AT('11:00') }), // upcoming
      record({ status: 'COMPLETED', startAt: AT('08:00'), completedAt: AT('08:20') }),
      record({ status: 'WAITING', startAt: AT('09:30'), arrivedAt: AT('09:25') }),
      record({ status: 'IN_TREATMENT', startAt: AT('09:45'), arrivedAt: AT('09:40') }),
      record({ status: 'SCHEDULED', startAt: AT('09:00') }), // late
    ]);

    const board = await service.getToday(CLINIC_A, AT('10:00'));

    expect(board.rows.map((row) => row.flowGroup)).toEqual([
      FLOW_GROUPS.IN_TREATMENT,
      FLOW_GROUPS.WAITING,
      FLOW_GROUPS.LATE,
      FLOW_GROUPS.UPCOMING,
      FLOW_GROUPS.COMPLETED,
    ]);
  });

  it('orders those already in the building by arrival, not by slot', async () => {
    reception.listDay.mockResolvedValueOnce([
      record({ status: 'WAITING', startAt: AT('09:00'), arrivedAt: AT('09:40') }),
      record({ status: 'WAITING', startAt: AT('09:30'), arrivedAt: AT('09:10') }),
    ]);

    const board = await service.getToday(CLINIC_A, AT('10:00'));

    // Whoever has been waiting longest is dealt with first.
    expect(board.rows[0]?.arrivedAt).toBe(AT('09:10').toISOString());
  });

  it('reports how late an unarrived patient is', async () => {
    reception.listDay.mockResolvedValueOnce([
      record({ status: 'SCHEDULED', startAt: AT('09:43') }),
    ]);

    const board = await service.getToday(CLINIC_A, AT('10:00'));
    expect(board.rows[0]?.lateByMinutes).toBe(17);
  });

  it('leaves lateness null once the patient is in the building', async () => {
    reception.listDay.mockResolvedValueOnce([
      record({ status: 'ARRIVED', startAt: AT('08:00'), arrivedAt: AT('09:50') }),
    ]);

    const board = await service.getToday(CLINIC_A, AT('10:00'));
    expect(board.rows[0]?.lateByMinutes).toBeNull();
  });

  it('keeps arrival and waiting as separate timestamps for distinct durations', async () => {
    reception.listDay.mockResolvedValueOnce([
      record({ status: 'WAITING', arrivedAt: AT('09:50'), waitingAt: AT('10:05') }),
    ]);

    const board = await service.getToday(CLINIC_A, AT('10:10'));
    const row = board.rows[0];

    expect(row?.arrivedAt).toBe(AT('09:50').toISOString());
    expect(row?.waitingAt).toBe(AT('10:05').toISOString());
    // Durations remain derived client-side from their authoritative timestamps.
    expect(Object.keys(row ?? {})).not.toContain('waitingMinutes');
  });

  it('counts the day without double counting a status', async () => {
    reception.listDay.mockResolvedValueOnce([
      record({ status: 'COMPLETED', completedAt: AT('08:20') }),
      record({ status: 'WAITING', arrivedAt: AT('09:30') }),
      record({ status: 'WAITING', arrivedAt: AT('09:35') }),
      record({ status: 'IN_TREATMENT', arrivedAt: AT('09:40') }),
      record({ status: 'SCHEDULED', startAt: AT('09:00') }),
      record({ status: 'SCHEDULED', startAt: AT('11:00') }),
      record({ status: 'NO_SHOW', noShowAt: AT('09:30') }),
      record({ status: 'CANCELLED' }),
    ]);

    const board = await service.getToday(CLINIC_A, AT('10:00'));

    expect(board.summary).toEqual({
      total: 8,
      completed: 1,
      waiting: 2,
      inTreatment: 1,
      late: 1,
      upcoming: 1,
      noShow: 1,
      cancelled: 1,
    });
  });

  it('handles two patients booked at the same time independently', async () => {
    // Overlap is a supported clinic reality, not an error.
    reception.listDay.mockResolvedValueOnce([
      record({ status: 'WAITING', startAt: AT('09:00'), arrivedAt: AT('08:55') }),
      record({
        status: 'SCHEDULED',
        startAt: AT('09:00'),
        patientFirstName: 'Mariem',
        patientLastName: 'Trabelsi',
      }),
    ]);

    const board = await service.getToday(CLINIC_A, AT('10:00'));

    expect(board.rows).toHaveLength(2);
    expect(board.rows[0]?.flowGroup).toBe(FLOW_GROUPS.WAITING);
    expect(board.rows[1]?.flowGroup).toBe(FLOW_GROUPS.LATE);
  });

  it('names the patient, the appointment type and the live treatment', async () => {
    reception.listDay.mockResolvedValueOnce([record()]);

    const board = await service.getToday(CLINIC_A, AT('10:00'));

    expect(board.rows[0]).toMatchObject({
      patientName: 'Ahmed Ben Salah',
      appointmentTypeName: 'Monthly control',
      treatmentLabel: 'Metal braces',
    });
  });

  it('prefers a clinic custom treatment label', async () => {
    reception.listDay.mockResolvedValueOnce([record({ treatmentCustomLabel: 'Invisalign Full' })]);

    const board = await service.getToday(CLINIC_A, AT('10:00'));
    expect(board.rows[0]?.treatmentLabel).toBe('Invisalign Full');
  });

  it('returns an empty board rather than failing for a clinic with no timezone', async () => {
    clinics.findById.mockResolvedValueOnce(null);

    const board = await service.getToday(CLINIC_A, AT('10:00'));

    expect(board.timezone).toBe('UTC');
    expect(board.rows).toEqual([]);
    expect(board.summary.total).toBe(0);
  });
});

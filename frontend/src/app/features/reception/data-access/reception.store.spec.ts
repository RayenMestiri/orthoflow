import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReceptionBoard, ReceptionRow } from '../models/reception.models';
import { ReceptionApiService } from './reception.api';
import { ReceptionStore } from './reception.store';

function apiError(code: string, message: string, status = 400): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { success: false, error: { code, message } } });
}

function row(overrides: Partial<ReceptionRow> = {}): ReceptionRow {
  return {
    appointmentId: 'appt-1',
    patientId: 'patient-1',
    patientName: 'Ahmed Ben Salah',
    appointmentTypeName: 'Monthly control',
    treatmentLabel: 'Metal braces',
    startAt: '2026-08-09T09:00:00.000Z',
    endAt: '2026-08-09T09:15:00.000Z',
    durationMinutes: 15,
    status: 'SCHEDULED',
    flowGroup: 'UPCOMING',
    lateByMinutes: null,
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

function board(rows: ReceptionRow[]): ReceptionBoard {
  return {
    date: '2026-08-09',
    timezone: 'Africa/Tunis',
    generatedAt: '2026-08-09T09:00:00.000Z',
    summary: {
      total: rows.length,
      completed: 0,
      waiting: 0,
      inTreatment: 0,
      late: 0,
      upcoming: rows.length,
      noShow: 0,
      cancelled: 0,
    },
    rows,
  };
}

describe('ReceptionStore', () => {
  let store: ReceptionStore;
  let api: {
    today: ReturnType<typeof vi.fn>;
    changeStatus: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    activity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    api = {
      today: vi.fn(() => of(board([row()]))),
      changeStatus: vi.fn(() => of({})),
      cancel: vi.fn(() => of({})),
      activity: vi.fn(() => of([])),
    };
    TestBed.configureTestingModule({
      providers: [ReceptionStore, { provide: ReceptionApiService, useValue: api }],
    });
    store = TestBed.inject(ReceptionStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loading', () => {
    it('reads the board', async () => {
      await store.load();

      expect(api.today).toHaveBeenCalledTimes(1);
      expect(store.rows()).toHaveLength(1);
      expect(store.isLoaded()).toBe(true);
    });

    it('surfaces a load failure', async () => {
      api.today.mockReturnValueOnce(
        throwError(() => apiError('INSUFFICIENT_PERMISSIONS', 'Not allowed', 403)),
      );

      await store.load();

      expect(store.error()).toBe('Not allowed');
      expect(store.isLoaded()).toBe(false);
    });

    it('keeps a readable board when a background poll fails', async () => {
      await store.load();
      api.today.mockReturnValueOnce(throwError(() => apiError('UNEXPECTED_ERROR', 'Offline', 500)));

      await store.load(true);

      // A blip must not wipe the board the desk is working from.
      expect(store.rows()).toHaveLength(1);
      expect(store.error()).toBeNull();
    });
  });

  describe('grouping', () => {
    it('buckets rows by flow group', async () => {
      api.today.mockReturnValueOnce(
        of(
          board([
            row({ appointmentId: 'a', flowGroup: 'IN_TREATMENT', status: 'IN_TREATMENT' }),
            row({ appointmentId: 'b', flowGroup: 'WAITING', status: 'WAITING' }),
            row({ appointmentId: 'c', flowGroup: 'LATE' }),
          ]),
        ),
      );

      await store.load();
      const grouped = store.byGroup();

      expect(grouped.IN_TREATMENT.map((item) => item.appointmentId)).toEqual(['a']);
      expect(grouped.WAITING.map((item) => item.appointmentId)).toEqual(['b']);
      expect(grouped.LATE.map((item) => item.appointmentId)).toEqual(['c']);
      expect(grouped.COMPLETED).toEqual([]);
    });

    it('names whoever is waiting as the next patient before any upcoming slot', async () => {
      api.today.mockReturnValueOnce(
        of(
          board([
            row({ appointmentId: 'waiting', flowGroup: 'WAITING', status: 'WAITING' }),
            row({ appointmentId: 'upcoming', flowGroup: 'UPCOMING' }),
          ]),
        ),
      );

      await store.load();

      // Someone standing at the desk outranks a booking that has not arrived.
      expect(store.nextPatient()?.appointmentId).toBe('waiting');
    });

    it('falls back to the first upcoming slot when nobody is here', async () => {
      await store.load();
      expect(store.nextPatient()?.appointmentId).toBe('appt-1');
    });

    it('recognises a day with no appointments', async () => {
      api.today.mockReturnValueOnce(of(board([])));
      await store.load();
      expect(store.isEmptyDay()).toBe(true);
    });
  });

  describe('transitions', () => {
    beforeEach(async () => {
      await store.load();
    });

    it('sends the transition and refreshes the board', async () => {
      const moved = await store.changeStatus('appt-1', 'ARRIVED');

      expect(moved).toBe(true);
      expect(api.changeStatus).toHaveBeenCalledWith('appt-1', 'ARRIVED');
      // Refetched so another user's concurrent change is picked up too.
      expect(api.today).toHaveBeenCalledTimes(2);
    });

    it('reports a rejected transition against that row only', async () => {
      api.changeStatus.mockReturnValueOnce(
        throwError(() =>
          apiError('APPOINTMENT_INVALID_STATUS_TRANSITION', 'Cannot go backwards', 422),
        ),
      );

      const moved = await store.changeStatus('appt-1', 'SCHEDULED');

      expect(moved).toBe(false);
      expect(store.rowError('appt-1')).toBe('Cannot go backwards');
      // The board itself stays usable.
      expect(store.error()).toBeNull();
      expect(store.rows()).toHaveLength(1);
    });

    it('ignores a second click while the first is in flight', async () => {
      let settle: (() => void) | undefined;
      api.changeStatus.mockReturnValueOnce(
        new Promise((resolve) => {
          settle = () => resolve(of({}));
        }) as never,
      );

      const first = store.changeStatus('appt-1', 'ARRIVED');
      const second = await store.changeStatus('appt-1', 'ARRIVED');

      // One patient must not be checked in twice by an impatient double click.
      expect(second).toBe(false);
      settle?.();
      await first.catch(() => undefined);
    });

    it('clears a row error on request', async () => {
      api.changeStatus.mockReturnValueOnce(throwError(() => apiError('X', 'Nope', 422)));
      await store.changeStatus('appt-1', 'ARRIVED');

      store.clearRowError('appt-1');

      expect(store.rowError('appt-1')).toBeNull();
    });

    it('cancels with a reason and refreshes', async () => {
      const cancelled = await store.cancel('appt-1', 'Patient called');

      expect(cancelled).toBe(true);
      expect(api.cancel).toHaveBeenCalledWith('appt-1', 'Patient called');
      expect(api.today).toHaveBeenCalledTimes(2);
    });
  });

  describe('activity timeline', () => {
    const entry = {
      id: 'audit-1',
      action: 'appointment.status_changed',
      actorName: 'Sarah Trabelsi',
      actorRole: 'SECRETARY' as const,
      metadata: { from: 'SCHEDULED', to: 'ARRIVED' },
      createdAt: '2026-08-09T09:03:00.000Z',
    };

    it('loads the timeline for one appointment', async () => {
      api.activity.mockReturnValueOnce(of([entry]));

      await store.loadActivity('appt-1');

      expect(api.activity).toHaveBeenCalledWith('appt-1');
      expect(store.activity()).toEqual([entry]);
      expect(store.activityFor()).toBe('appt-1');
      expect(store.isActivityLoading()).toBe(false);
    });

    it('reports a timeline failure without touching the board', async () => {
      await store.load();
      api.activity.mockReturnValueOnce(throwError(() => apiError('UNEXPECTED_ERROR', 'Boom', 500)));

      await store.loadActivity('appt-1');

      expect(store.activityError()).toBe("Activity history couldn't be loaded.");
      expect(store.activity()).toEqual([]);
      // The queue the desk is working from must stay untouched.
      expect(store.error()).toBeNull();
      expect(store.rows()).toHaveLength(1);
    });

    it('never leaves one appointment’s history under another’s name', async () => {
      let settleFirst: ((value: unknown) => void) | undefined;
      api.activity.mockReturnValueOnce(
        new Promise((resolve) => {
          settleFirst = resolve;
        }) as never,
      );
      const first = store.loadActivity('appt-1');

      api.activity.mockReturnValueOnce(of([entry]));
      await store.loadActivity('appt-2');

      settleFirst?.(of([{ ...entry, id: 'stale' }]));
      await first;

      expect(store.activityFor()).toBe('appt-2');
      expect(store.activity().map((item) => item.id)).toEqual(['audit-1']);
    });

    it('drops the timeline when the drawer closes', async () => {
      api.activity.mockReturnValueOnce(of([entry]));
      await store.loadActivity('appt-1');

      store.clearActivity();

      expect(store.activity()).toEqual([]);
      expect(store.activityFor()).toBeNull();
      expect(store.activityError()).toBeNull();
    });
  });

  describe('timers', () => {
    it('polls the board without being asked again', async () => {
      await store.load();
      expect(api.today).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(45_000);

      expect(api.today).toHaveBeenCalledTimes(2);
    });

    it('ticks its clock locally instead of polling for durations', async () => {
      await store.load();
      const before = store.now();
      api.today.mockClear();

      await vi.advanceTimersByTimeAsync(30_000);

      expect(store.now()).toBeGreaterThan(before);
      // A minute of ticking must not become a minute of requests.
      expect(api.today).not.toHaveBeenCalled();
    });

    it('stops both timers when the page is destroyed', async () => {
      await store.load();
      api.today.mockClear();

      TestBed.resetTestingModule();
      await vi.advanceTimersByTimeAsync(120_000);

      expect(api.today).not.toHaveBeenCalled();
    });
  });
});

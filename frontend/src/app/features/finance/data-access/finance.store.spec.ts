import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceOverview, PatientBalance } from '../models/finance.models';
import { FinanceApiService, type PatientBalancePage } from './finance.api';
import { FinanceStore } from './finance.store';

function apiError(code: string, message: string, status = 400): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { success: false, error: { code, message } } });
}

function overview(overrides: Partial<FinanceOverview['summary']> = {}): FinanceOverview {
  return {
    summary: {
      currency: 'TND',
      receivedTodayMinor: 850_000,
      receivedTodayCount: 7,
      receivedMonthMinor: 12_450_000,
      receivedMonthCount: 63,
      outstandingMinor: 28_700_000,
      outstandingPatientCount: 31,
      activeTreatmentPatientCount: 46,
      totalAgreedMinor: 42_000_000,
      totalRecordedMinor: 28_100_000,
      collectedPercent: 67,
      ...overrides,
    },
    attention: {
      outstandingCount: 12,
      noPaymentCount: 5,
      overpaidCount: 2,
      cancelledUncorrectedCount: 3,
      overpaidExcessMinor: 320_000,
      outstandingMinor: 28_700_000,
    },
    distribution: {
      paid: 18,
      partiallyPaid: 21,
      noPayment: 5,
      overpaid: 2,
      noAgreedPrice: 0,
      overpaidExcessMinor: 320_000,
    },
  };
}

function balance(overrides: Partial<PatientBalance> = {}): PatientBalance {
  return {
    patientId: 'patient-1',
    patientName: 'Ahmed Ben Salah',
    treatmentId: 'treatment-1',
    treatmentLabel: 'Metal braces',
    treatmentStatus: 'ACTIVE',
    agreedMinor: 3_600_000,
    recordedMinor: 1_400_000,
    remainingMinor: 2_200_000,
    overpaidMinor: null,
    paymentStatus: 'PARTIALLY_PAID',
    lastPaymentAt: '2026-08-09T09:42:00.000Z',
    ...overrides,
  };
}

function page(items: PatientBalance[], total = items.length): PatientBalancePage {
  return { items, page: 1, limit: 20, total, pages: Math.ceil(total / 20) };
}

describe('FinanceStore', () => {
  let store: FinanceStore;
  let api: {
    overview: ReturnType<typeof vi.fn>;
    patientBalances: ReturnType<typeof vi.fn>;
    activity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      overview: vi.fn(() => of(overview())),
      patientBalances: vi.fn(() => of(page([balance()]))),
      activity: vi.fn(() => of([])),
    };
    TestBed.configureTestingModule({
      providers: [FinanceStore, { provide: FinanceApiService, useValue: api }],
    });
    store = TestBed.inject(FinanceStore);
  });

  describe('loading', () => {
    it('loads the three regions concurrently', async () => {
      await store.load();

      expect(api.overview).toHaveBeenCalledTimes(1);
      expect(api.patientBalances).toHaveBeenCalledTimes(1);
      expect(api.activity).toHaveBeenCalledTimes(1);
      expect(store.currency()).toBe('TND');
      expect(store.balances()).toHaveLength(1);
    });

    it('keeps the rest of the page usable when one region fails', async () => {
      // A broken activity feed must not take the balances table down with it.
      api.activity.mockReturnValueOnce(
        throwError(() => apiError('UNEXPECTED_ERROR', 'Activity unavailable', 500)),
      );

      await store.load();

      expect(store.activityError()).toBe('Activity unavailable');
      expect(store.balancesError()).toBeNull();
      expect(store.overviewError()).toBeNull();
      expect(store.balances()).toHaveLength(1);
      expect(store.overview()).not.toBeNull();
    });

    it('surfaces a balances failure on its own', async () => {
      api.patientBalances.mockReturnValueOnce(
        throwError(() => apiError('INSUFFICIENT_PERMISSIONS', 'Not allowed here', 403)),
      );

      await store.load();

      expect(store.balancesError()).toBe('Not allowed here');
      expect(store.overview()).not.toBeNull();
    });
  });

  describe('table controls', () => {
    beforeEach(async () => {
      await store.load();
    });

    it('sends the selected filter to the server', async () => {
      await store.setFilter('OUTSTANDING');

      expect(api.patientBalances).toHaveBeenLastCalledWith(
        expect.objectContaining({ filter: 'OUTSTANDING', page: 1 }),
      );
      expect(store.filter()).toBe('OUTSTANDING');
    });

    it('sends the selected sort', async () => {
      await store.setSort('PATIENT_NAME');
      expect(api.patientBalances).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'PATIENT_NAME' }),
      );
    });

    it('returns to page 1 whenever the view changes', async () => {
      await store.setPage(3);
      expect(store.page()).toBe(3);

      await store.setFilter('PAID');

      // Page 3 of a different filter is a different set of rows entirely.
      expect(store.page()).toBe(1);
      expect(api.patientBalances).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    });

    it('passes the search term through', async () => {
      await store.setSearch('ahmed');
      expect(api.patientBalances).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'ahmed' }),
      );
    });

    it('never lets a slow earlier response overwrite the current filter', async () => {
      // Rapid filter switching: the first request resolves last and must lose.
      const slow = new Subject<PatientBalancePage>();
      const fast = new Subject<PatientBalancePage>();
      api.patientBalances.mockReturnValueOnce(slow).mockReturnValueOnce(fast);

      const first = store.setFilter('OUTSTANDING');
      const second = store.setFilter('PAID');

      fast.next(page([balance({ treatmentId: 'paid-row', paymentStatus: 'PAID' })]));
      fast.complete();
      await second;

      slow.next(page([balance({ treatmentId: 'stale-row' })]));
      slow.complete();
      await first;

      expect(store.balances().map((row) => row.treatmentId)).toEqual(['paid-row']);
      expect(store.filter()).toBe('PAID');
    });
  });

  describe('empty workspace', () => {
    it('recognises a clinic that has never recorded anything', async () => {
      api.overview.mockReturnValueOnce(
        of(overview({ receivedMonthCount: 0, receivedTodayCount: 0 })),
      );
      api.patientBalances.mockReturnValueOnce(of(page([], 0)));

      await store.load();

      expect(store.isEmptyWorkspace()).toBe(true);
    });

    it('does not call an empty filtered result an empty workspace', async () => {
      // "No overpayments" is good news, not an onboarding state.
      api.patientBalances.mockReturnValue(of(page([], 0)));
      await store.load();
      await store.setFilter('OVERPAID');

      expect(store.isEmptyWorkspace()).toBe(false);
    });
  });

  it('refreshes every region after a payment is recorded elsewhere', async () => {
    await store.load();
    await store.refreshAfterMutation();

    expect(api.overview).toHaveBeenCalledTimes(2);
    expect(api.patientBalances).toHaveBeenCalledTimes(2);
    expect(api.activity).toHaveBeenCalledTimes(2);
  });
});

import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PermissionService, PERMISSIONS } from '../../../core/auth/permissions';
import type {
  AppointmentReports,
  FinanceReports,
  ReportMetric,
  ReportOverview,
  ReportPeriod,
  TreatmentRetentionReports,
} from '../models/reports.models';
import { ReportsApiService } from './reports.api';
import { ReportsStore } from './reports.store';

const period: ReportPeriod = {
  preset: 'this-month',
  timezone: 'Africa/Lagos',
  from: '2026-07-31T23:00:00.000Z',
  to: '2026-08-31T23:00:00.000Z',
  effectiveTo: '2026-08-23T10:00:00.000Z',
  fromDate: '2026-08-01',
  toDate: '2026-08-31',
  comparisonFrom: '2026-06-30T23:00:00.000Z',
  comparisonTo: '2026-07-31T23:00:00.000Z',
  bucket: 'day',
};

function metric(value: number): ReportMetric {
  return { value, previousValue: value - 1, absoluteChange: 1, percentChange: 10 };
}

function appointments(booked = 8): AppointmentReports {
  return {
    period,
    booked: metric(booked),
    eligible: metric(7),
    completed: metric(5),
    cancelled: metric(1),
    noShow: metric(1),
    attended: metric(6),
    unresolved: metric(0),
    noShowRate: metric(14.3),
    attendanceRate: metric(85.7),
    volumeTrend: [],
    noShowTrend: [],
    generatedAt: period.effectiveTo,
  };
}

function configure(allowed = new Set<string>(Object.values(PERMISSIONS))) {
  const overview: ReportOverview = {
    period,
    completedClinicalVisits: metric(5),
    uniquePatientsSeen: metric(4),
    newPatients: metric(2),
    generatedAt: period.effectiveTo,
  };
  const treatments: TreatmentRetentionReports = {
    period,
    treatments: {
      activeNow: 12,
      pausedNow: 1,
      started: metric(2),
      completed: metric(1),
      cancelled: metric(0),
      startedTrend: [],
      completedTrend: [],
    },
    retention: {
      activePlansNow: 4,
      activeDevicesNow: 5,
      started: metric(1),
      completed: metric(1),
      replacements: metric(0),
    },
    generatedAt: period.effectiveTo,
  };
  const finance: FinanceReports = {
    period,
    currency: 'TND',
    cashRecordedMinor: metric(120_000),
    paymentCount: metric(4),
    cancelledPaymentCount: metric(0),
    currentSnapshot: {
      outstandingMinor: 50_000,
      outstandingPatientCount: 2,
      totalAgreedMinor: 200_000,
      totalRecordedMinor: 150_000,
      collectedPercent: 75,
    },
    cashTrend: [],
    generatedAt: period.effectiveTo,
  };
  const api = {
    overview: vi.fn(() => of(overview)),
    appointments: vi.fn(() => of(appointments())),
    treatmentsRetention: vi.fn(() => of(treatments)),
    finance: vi.fn(() => of(finance)),
    careContinuity: vi.fn(() =>
      of({
        asOf: period.effectiveTo,
        timezone: period.timezone,
        needsAttention: 2,
        lostToFollowUp: 1,
        byCareType: [],
        byReason: [],
      }),
    ),
  };
  TestBed.configureTestingModule({
    providers: [
      ReportsStore,
      { provide: ReportsApiService, useValue: api },
      { provide: PermissionService, useValue: { can: (permission: string) => allowed.has(permission) } },
    ],
  });
  return { store: TestBed.inject(ReportsStore), api };
}

describe('ReportsStore', () => {
  it('loads every permitted report section on the initial period', async () => {
    const { store, api } = configure();

    await store.load({ preset: 'this-month' });

    expect(api.overview).toHaveBeenCalledWith({ preset: 'this-month' });
    expect(api.appointments).toHaveBeenCalledWith({ preset: 'this-month' });
    expect(api.treatmentsRetention).toHaveBeenCalledWith({ preset: 'this-month' });
    expect(api.finance).toHaveBeenCalledWith({ preset: 'this-month' });
    expect(api.careContinuity).toHaveBeenCalledTimes(1);
    expect(store.overview().data?.newPatients.value).toBe(2);
  });

  it('keeps successful sections available when one report fails', async () => {
    const { store, api } = configure();
    api.finance.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 500,
            error: { success: false, error: { code: 'UNEXPECTED_ERROR', message: 'Finance unavailable' } },
          }),
      ),
    );

    await store.load({ preset: 'this-month' });

    expect(store.appointments().data?.booked.value).toBe(8);
    expect(store.finance().data).toBeNull();
    expect(store.finance().error).toBe('Finance unavailable');
  });

  it('does not let a slow earlier period overwrite the latest period', async () => {
    const { store, api } = configure();
    const slow = new Subject<AppointmentReports>();
    const fast = new Subject<AppointmentReports>();
    api.appointments.mockReturnValueOnce(slow).mockReturnValueOnce(fast);

    const first = store.load({ preset: 'last-month' });
    const second = store.load({ preset: 'this-month' });
    fast.next(appointments(12));
    fast.complete();
    await second;
    slow.next(appointments(3));
    slow.complete();
    await first;

    expect(store.appointments().data?.booked.value).toBe(12);
  });

  it('does not request finance without the cash-record permission', async () => {
    const permissions = new Set<string>(Object.values(PERMISSIONS));
    permissions.delete(PERMISSIONS.CASH_RECORDS_VIEW);
    const { store, api } = configure(permissions);

    await store.load({ preset: 'this-month' });

    expect(store.canViewFinance).toBe(false);
    expect(api.finance).not.toHaveBeenCalled();
  });
});

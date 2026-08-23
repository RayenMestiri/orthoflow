import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicRepository } from '../../src/modules/clinics/clinic.repository.js';
import type { FinanceRepository } from '../../src/modules/finance/finance.repository.js';
import type { FinanceService } from '../../src/modules/finance/finance.service.js';
import type { CareContinuityService } from '../../src/modules/follow-ups/care-continuity.service.js';
import type { ReportsRepository } from '../../src/modules/reports/reports.repository.js';
import { ReportsService } from '../../src/modules/reports/reports.service.js';

const CLINIC_ID = '652f1c9b8a1e4f0012ab34cd';

describe('ReportsService', () => {
  let reports: {
    appointmentMetrics: ReturnType<typeof vi.fn>;
    clinicalMetrics: ReturnType<typeof vi.fn>;
    treatmentMetrics: ReturnType<typeof vi.fn>;
    retentionMetrics: ReturnType<typeof vi.fn>;
  };
  let finance: {
    aggregateRecordedBetween: ReturnType<typeof vi.fn>;
    countCancelledBetween: ReturnType<typeof vi.fn>;
  };
  let financeOverview: { getOverview: ReturnType<typeof vi.fn> };
  let continuity: { summarize: ReturnType<typeof vi.fn> };
  let service: ReportsService;

  beforeEach(() => {
    reports = {
      appointmentMetrics: vi.fn(),
      clinicalMetrics: vi.fn(),
      treatmentMetrics: vi.fn(),
      retentionMetrics: vi.fn(),
    };
    const clinics = {
      findById: vi.fn(async () => ({ timezone: 'Africa/Lagos', currency: 'TND' })),
    };
    finance = {
      aggregateRecordedBetween: vi.fn(),
      countCancelledBetween: vi.fn(),
    };
    financeOverview = { getOverview: vi.fn() };
    continuity = { summarize: vi.fn() };
    service = new ReportsService(
      reports as unknown as ReportsRepository,
      clinics as unknown as ClinicRepository,
      finance as unknown as FinanceRepository,
      financeOverview as unknown as FinanceService,
      continuity as unknown as CareContinuityService,
    );
  });

  it('uses eligible elapsed appointments as the exact no-show denominator', async () => {
    reports.appointmentMetrics
      .mockResolvedValueOnce({
        summary: { booked: 100, eligible: 80, completed: 60, cancelled: 20, noShow: 8, attended: 70 },
        series: [{ bucket: new Date('2026-08-01T00:00:00.000Z'), booked: 100, eligible: 80, completed: 60, cancelled: 20, noShow: 8, attended: 70 }],
      })
      .mockResolvedValueOnce({
        summary: { booked: 90, eligible: 75, completed: 55, cancelled: 15, noShow: 5, attended: 68 },
        series: [],
      });

    const result = await service.appointments(
      CLINIC_ID,
      { preset: 'this-month' },
      new Date('2026-08-23T10:15:00.000Z'),
    );

    expect(result.noShowRate.value).toBe(10);
    expect(result.attendanceRate.value).toBe(87.5);
    expect(result.unresolved.value).toBe(2);
    expect(result.noShowTrend[0]).toMatchObject({ value: 8, denominator: 80, rate: 10 });
  });

  it('defines new patients by Patient.createdAt independently of patients seen', async () => {
    reports.clinicalMetrics
      .mockResolvedValueOnce({ completed: 24, uniquePatients: 19, newPatients: 7 })
      .mockResolvedValueOnce({ completed: 20, uniquePatients: 18, newPatients: 4 });

    const result = await service.overview(
      CLINIC_ID,
      { preset: 'this-month' },
      new Date('2026-08-23T10:15:00.000Z'),
    );

    expect(result.completedClinicalVisits.value).toBe(24);
    expect(result.uniquePatientsSeen.value).toBe(19);
    expect(result.newPatients).toMatchObject({ value: 7, previousValue: 4, absoluteChange: 3 });
  });

  it('keeps treatment and retention snapshots separate from period flows', async () => {
    reports.treatmentMetrics
      .mockResolvedValueOnce({
        activeNow: 12,
        pausedNow: 2,
        started: 5,
        completed: 3,
        cancelled: 1,
        startedSeries: [{ bucket: new Date('2026-08-01T00:00:00.000Z'), value: 5 }],
        completedSeries: [{ bucket: new Date('2026-08-01T00:00:00.000Z'), value: 3 }],
      })
      .mockResolvedValueOnce({
        activeNow: 0,
        pausedNow: 0,
        started: 4,
        completed: 2,
        cancelled: 0,
        startedSeries: [],
        completedSeries: [],
      });
    reports.retentionMetrics
      .mockResolvedValueOnce({
        activePlansNow: 7,
        activeDevicesNow: 8,
        started: 2,
        completed: 1,
        replacements: 3,
      })
      .mockResolvedValueOnce({
        activePlansNow: 0,
        activeDevicesNow: 0,
        started: 1,
        completed: 1,
        replacements: 1,
      });

    const result = await service.treatmentsRetention(
      CLINIC_ID,
      { preset: 'this-month' },
      new Date('2026-08-23T10:15:00.000Z'),
    );

    expect(result.treatments.activeNow).toBe(12);
    expect(result.treatments.started).toMatchObject({ value: 5, previousValue: 4 });
    expect(result.treatments.completed.value).toBe(3);
    expect(result.retention.activePlansNow).toBe(7);
    expect(result.retention.started).toMatchObject({ value: 2, previousValue: 1 });
    expect(result.retention.replacements.value).toBe(3);
  });

  it('reuses valid-cash aggregates and the Finance snapshot without recalculating balances', async () => {
    finance.aggregateRecordedBetween
      .mockResolvedValueOnce({
        totalMinor: 1_845_000,
        count: 18,
        series: [{ bucket: new Date('2026-08-01T00:00:00.000Z'), value: 1_845_000, count: 18 }],
      })
      .mockResolvedValueOnce({ totalMinor: 1_200_000, count: 12, series: [] });
    finance.countCancelledBetween.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    financeOverview.getOverview.mockResolvedValueOnce({
      summary: {
        outstandingMinor: 850_000,
        outstandingPatientCount: 4,
        totalAgreedMinor: 3_000_000,
        totalRecordedMinor: 2_150_000,
        collectedPercent: 71.7,
      },
    });

    const result = await service.financeReport(
      CLINIC_ID,
      { preset: 'this-month' },
      new Date('2026-08-23T10:15:00.000Z'),
    );

    expect(result.cashRecordedMinor).toMatchObject({ value: 1_845_000, previousValue: 1_200_000 });
    expect(result.cancelledPaymentCount).toMatchObject({ value: 2, previousValue: 1 });
    expect(result.currentSnapshot.outstandingMinor).toBe(850_000);
    expect(financeOverview.getOverview).toHaveBeenCalledWith(
      CLINIC_ID,
      new Date('2026-08-23T10:15:00.000Z'),
    );
  });

  it('returns care continuity as a current snapshot without fabricating a trend', async () => {
    continuity.summarize.mockResolvedValueOnce({
      timezone: 'Africa/Lagos',
      summary: { needsAttention: 6, lostToFollowUp: 2 },
      byCareType: [{ careType: 'TREATMENT', needsAttention: 4, lostToFollowUp: 1 }],
      byReason: [{ reason: 'NO_FUTURE_APPOINTMENT', count: 3 }],
    });

    const result = await service.careContinuity(
      CLINIC_ID,
      new Date('2026-08-23T10:15:00.000Z'),
    );

    expect(result).toMatchObject({
      needsAttention: 6,
      lostToFollowUp: 2,
      byReason: [{ reason: 'NO_FUTURE_APPOINTMENT', count: 3 }],
    });
    expect(result).not.toHaveProperty('trend');
  });
});

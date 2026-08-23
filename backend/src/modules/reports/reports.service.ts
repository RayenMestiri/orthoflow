import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { clinicDateKey } from '../../common/utils/clinic-time.js';
import { DEFAULT_CURRENCY } from '../../common/utils/money.js';
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import { financeRepository, type FinanceRepository } from '../finance/finance.repository.js';
import { financeService, type FinanceService } from '../finance/finance.service.js';
import {
  careContinuityService,
  type CareContinuityService,
} from '../follow-ups/care-continuity.service.js';
import { publicReportPeriod, resolveReportPeriod } from './reports.period.js';
import { reportsRepository, type ReportRange, type ReportsRepository } from './reports.repository.js';
import {
  type AppointmentReports,
  type CareContinuityReports,
  type FinanceReports,
  type ReportMetric,
  type ReportPeriodQuery,
  type ReportSeriesPoint,
  type ResolvedReportPeriod,
  type TreatmentRetentionReports,
  type ReportOverview,
} from './reports.types.js';

function metric(value: number, previousValue: number | null): ReportMetric {
  if (previousValue === null) {
    return { value, previousValue: null, absoluteChange: null, percentChange: null };
  }
  return {
    value,
    previousValue,
    absoluteChange: value - previousValue,
    percentChange:
      previousValue === 0 ? null : Math.round(((value - previousValue) / previousValue) * 1000) / 10,
  };
}

function rate(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;
}

function rateMetric(value: number, previousValue: number | null): ReportMetric {
  return {
    value,
    previousValue,
    absoluteChange: previousValue === null ? null : Math.round((value - previousValue) * 10) / 10,
    percentChange: null,
  };
}

function rangeFrom(period: ResolvedReportPeriod): ReportRange {
  return {
    from: period.fromInstant,
    to: period.effectiveToInstant,
    bucket: period.bucket,
    timezone: period.timezone,
  };
}

function comparisonRange(period: ResolvedReportPeriod): ReportRange | null {
  return period.comparisonFromInstant && period.comparisonToInstant
    ? {
        from: period.comparisonFromInstant,
        to: period.comparisonToInstant,
        bucket: period.bucket,
        timezone: period.timezone,
      }
    : null;
}

function addDateKeyDay(key: string): string {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function dateOnlyRange(range: Pick<ReportRange, 'from' | 'to' | 'timezone'>) {
  const fromKey = clinicDateKey(range.from, range.timezone);
  const finalInstant = new Date(Math.max(range.from.getTime(), range.to.getTime() - 1));
  const toExclusiveKey = addDateKeyDay(clinicDateKey(finalInstant, range.timezone));
  return {
    from: new Date(`${fromKey}T00:00:00.000Z`),
    to: new Date(`${toExclusiveKey}T00:00:00.000Z`),
  };
}

function series(rows: Array<{ bucket: Date; value: number }>): ReportSeriesPoint[] {
  return rows.map((row) => ({ bucket: row.bucket.toISOString(), value: row.value }));
}

export class ReportsService {
  constructor(
    private readonly reports: ReportsRepository = reportsRepository,
    private readonly clinics: ClinicRepository = clinicRepository,
    private readonly finance: FinanceRepository = financeRepository,
    private readonly financeOverview: FinanceService = financeService,
    private readonly continuity: CareContinuityService = careContinuityService,
  ) {}

  private async period(clinicId: string, query: ReportPeriodQuery, now: Date) {
    const clinic = await this.clinics.findById(clinicId);
    if (!clinic) throw new NotFoundError('Clinic not found', { code: ERROR_CODES.CLINIC_NOT_FOUND });
    return {
      clinic,
      period: resolveReportPeriod(query, clinic.timezone || 'UTC', now),
    };
  }

  async overview(
    clinicId: string,
    query: ReportPeriodQuery,
    now: Date = new Date(),
  ): Promise<ReportOverview> {
    const { period } = await this.period(clinicId, query, now);
    const currentRange = rangeFrom(period);
    const previousRange = comparisonRange(period);
    const [current, previous] = await Promise.all([
      this.reports.clinicalMetrics(clinicId, currentRange),
      previousRange
        ? this.reports.clinicalMetrics(clinicId, previousRange)
        : Promise.resolve(null),
    ]);
    return {
      period: publicReportPeriod(period),
      completedClinicalVisits: metric(current.completed, previous?.completed ?? null),
      uniquePatientsSeen: metric(current.uniquePatients, previous?.uniquePatients ?? null),
      newPatients: metric(current.newPatients, previous?.newPatients ?? null),
      generatedAt: now.toISOString(),
    };
  }

  async appointments(
    clinicId: string,
    query: ReportPeriodQuery,
    now: Date = new Date(),
  ): Promise<AppointmentReports> {
    const { period } = await this.period(clinicId, query, now);
    const previousRange = comparisonRange(period);
    const [current, previous] = await Promise.all([
      this.reports.appointmentMetrics(clinicId, rangeFrom(period)),
      previousRange
        ? this.reports.appointmentMetrics(clinicId, previousRange)
        : Promise.resolve(null),
    ]);
    const unresolved = Math.max(0, current.summary.eligible - current.summary.attended - current.summary.noShow);
    const previousUnresolved = previous
      ? Math.max(0, previous.summary.eligible - previous.summary.attended - previous.summary.noShow)
      : null;
    const noShowRate = rate(current.summary.noShow, current.summary.eligible);
    const previousNoShowRate = previous
      ? rate(previous.summary.noShow, previous.summary.eligible)
      : null;
    const attendanceRate = rate(current.summary.attended, current.summary.eligible);
    const previousAttendanceRate = previous
      ? rate(previous.summary.attended, previous.summary.eligible)
      : null;

    return {
      period: publicReportPeriod(period),
      booked: metric(current.summary.booked, previous?.summary.booked ?? null),
      eligible: metric(current.summary.eligible, previous?.summary.eligible ?? null),
      completed: metric(current.summary.completed, previous?.summary.completed ?? null),
      cancelled: metric(current.summary.cancelled, previous?.summary.cancelled ?? null),
      noShow: metric(current.summary.noShow, previous?.summary.noShow ?? null),
      attended: metric(current.summary.attended, previous?.summary.attended ?? null),
      unresolved: metric(unresolved, previousUnresolved),
      noShowRate: rateMetric(noShowRate, previousNoShowRate),
      attendanceRate: rateMetric(attendanceRate, previousAttendanceRate),
      volumeTrend: current.series.map((row) => ({
        bucket: row.bucket.toISOString(),
        value: row.booked,
      })),
      noShowTrend: current.series.map((row) => ({
        bucket: row.bucket.toISOString(),
        value: row.noShow,
        denominator: row.eligible,
        rate: rate(row.noShow, row.eligible),
      })),
      generatedAt: now.toISOString(),
    };
  }

  async treatmentsRetention(
    clinicId: string,
    query: ReportPeriodQuery,
    now: Date = new Date(),
  ): Promise<TreatmentRetentionReports> {
    const { period } = await this.period(clinicId, query, now);
    const currentRange = rangeFrom(period);
    const previousRange = comparisonRange(period);
    const [currentTreatments, previousTreatments, currentRetention, previousRetention] =
      await Promise.all([
        this.reports.treatmentMetrics(clinicId, currentRange, dateOnlyRange(currentRange), true),
        previousRange
          ? this.reports.treatmentMetrics(
              clinicId,
              previousRange,
              dateOnlyRange(previousRange),
              false,
            )
          : Promise.resolve(null),
        this.reports.retentionMetrics(clinicId, currentRange, true),
        previousRange
          ? this.reports.retentionMetrics(clinicId, previousRange, false)
          : Promise.resolve(null),
      ]);
    return {
      period: publicReportPeriod(period),
      treatments: {
        activeNow: currentTreatments.activeNow,
        pausedNow: currentTreatments.pausedNow,
        started: metric(currentTreatments.started, previousTreatments?.started ?? null),
        completed: metric(currentTreatments.completed, previousTreatments?.completed ?? null),
        cancelled: metric(currentTreatments.cancelled, previousTreatments?.cancelled ?? null),
        startedTrend: series(currentTreatments.startedSeries),
        completedTrend: series(currentTreatments.completedSeries),
      },
      retention: {
        activePlansNow: currentRetention.activePlansNow,
        activeDevicesNow: currentRetention.activeDevicesNow,
        started: metric(currentRetention.started, previousRetention?.started ?? null),
        completed: metric(currentRetention.completed, previousRetention?.completed ?? null),
        replacements: metric(currentRetention.replacements, previousRetention?.replacements ?? null),
      },
      generatedAt: now.toISOString(),
    };
  }

  async financeReport(
    clinicId: string,
    query: ReportPeriodQuery,
    now: Date = new Date(),
  ): Promise<FinanceReports> {
    const { clinic, period } = await this.period(clinicId, query, now);
    const currentRange = rangeFrom(period);
    const previousRange = comparisonRange(period);
    const [current, previous, cancelled, previousCancelled, snapshot] = await Promise.all([
      this.finance.aggregateRecordedBetween(
        clinicId,
        currentRange.from,
        currentRange.to,
        currentRange.bucket,
        currentRange.timezone,
      ),
      previousRange
        ? this.finance.aggregateRecordedBetween(
            clinicId,
            previousRange.from,
            previousRange.to,
            previousRange.bucket,
            previousRange.timezone,
          )
        : Promise.resolve(null),
      this.finance.countCancelledBetween(clinicId, currentRange.from, currentRange.to),
      previousRange
        ? this.finance.countCancelledBetween(clinicId, previousRange.from, previousRange.to)
        : Promise.resolve(null),
      this.financeOverview.getOverview(clinicId, now),
    ]);
    return {
      period: publicReportPeriod(period),
      currency: clinic.currency?.toUpperCase() || DEFAULT_CURRENCY,
      cashRecordedMinor: metric(current.totalMinor, previous?.totalMinor ?? null),
      paymentCount: metric(current.count, previous?.count ?? null),
      cancelledPaymentCount: metric(cancelled, previousCancelled),
      currentSnapshot: {
        outstandingMinor: snapshot.summary.outstandingMinor,
        outstandingPatientCount: snapshot.summary.outstandingPatientCount,
        totalAgreedMinor: snapshot.summary.totalAgreedMinor,
        totalRecordedMinor: snapshot.summary.totalRecordedMinor,
        collectedPercent: snapshot.summary.collectedPercent,
      },
      cashTrend: current.series.map((row) => ({
        bucket: row.bucket.toISOString(),
        value: row.value,
        denominator: row.count,
      })),
      generatedAt: now.toISOString(),
    };
  }

  async careContinuity(clinicId: string, now: Date = new Date()): Promise<CareContinuityReports> {
    const result = await this.continuity.summarize(clinicId, now);
    return {
      asOf: now.toISOString(),
      timezone: result.timezone,
      needsAttention: result.summary.needsAttention,
      lostToFollowUp: result.summary.lostToFollowUp,
      byCareType: result.byCareType,
      byReason: result.byReason,
    };
  }
}

export const reportsService = new ReportsService();

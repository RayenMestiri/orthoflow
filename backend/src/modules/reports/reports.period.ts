import { ValidationError } from '../../common/errors/app-error.js';
import { clinicCalendarDate, zoneOffsetMs } from '../../common/utils/clinic-day.js';
import {
  REPORT_PRESETS,
  type ReportBucket,
  type ReportPeriodQuery,
  type ResolvedReportPeriod,
} from './reports.types.js';

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 732;

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function dateKey(date: CalendarDate): string {
  return `${date.year.toString().padStart(4, '0')}-${date.month.toString().padStart(2, '0')}-${date.day.toString().padStart(2, '0')}`;
}

function parseDateKey(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ValidationError('Report dates must use YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new ValidationError('Report date is not a valid calendar date');
  }
  return { year, month, day };
}

function addDays(date: CalendarDate, amount: number): CalendarDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + amount));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function addMonths(date: CalendarDate, amount: number): CalendarDate {
  const next = new Date(Date.UTC(date.year, date.month - 1 + amount, 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: 1 };
}

function localMidnight(date: CalendarDate, timezone: string): Date {
  const naive = Date.UTC(date.year, date.month - 1, date.day);
  return new Date(naive - zoneOffsetMs(new Date(naive), timezone));
}

function bucketFor(from: Date, to: Date): ReportBucket {
  const days = Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
  if (days <= 45) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

function rangeForPreset(
  preset: Exclude<ReportPeriodQuery['preset'], 'custom' | undefined>,
  today: CalendarDate,
): { from: CalendarDate; toExclusive: CalendarDate; previousFrom: CalendarDate } {
  const monthStart = { year: today.year, month: today.month, day: 1 };
  switch (preset) {
    case REPORT_PRESETS.LAST_MONTH: {
      const from = addMonths(monthStart, -1);
      return { from, toExclusive: monthStart, previousFrom: addMonths(from, -1) };
    }
    case REPORT_PRESETS.LAST_3_MONTHS: {
      const from = addMonths(monthStart, -2);
      return { from, toExclusive: addMonths(monthStart, 1), previousFrom: addMonths(from, -3) };
    }
    case REPORT_PRESETS.LAST_6_MONTHS: {
      const from = addMonths(monthStart, -5);
      return { from, toExclusive: addMonths(monthStart, 1), previousFrom: addMonths(from, -6) };
    }
    case REPORT_PRESETS.THIS_YEAR: {
      const from = { year: today.year, month: 1, day: 1 };
      return {
        from,
        toExclusive: { year: today.year + 1, month: 1, day: 1 },
        previousFrom: { year: today.year - 1, month: 1, day: 1 },
      };
    }
    default:
      return { from: monthStart, toExclusive: addMonths(monthStart, 1), previousFrom: addMonths(monthStart, -1) };
  }
}

export function resolveReportPeriod(
  query: ReportPeriodQuery,
  timezone: string,
  now: Date = new Date(),
): ResolvedReportPeriod {
  const hasCustomDates = query.from !== undefined || query.to !== undefined;
  if (hasCustomDates && query.preset && query.preset !== REPORT_PRESETS.CUSTOM) {
    throw new ValidationError('Use either a report preset or a custom date range');
  }

  const today = clinicCalendarDate(now, timezone);
  let preset = query.preset ?? REPORT_PRESETS.THIS_MONTH;
  let fromDate: CalendarDate;
  let toExclusiveDate: CalendarDate;
  let previousFromDate: CalendarDate | null = null;

  if (hasCustomDates || preset === REPORT_PRESETS.CUSTOM) {
    if (!query.from || !query.to) throw new ValidationError('Custom reports require from and to dates');
    preset = REPORT_PRESETS.CUSTOM;
    fromDate = parseDateKey(query.from);
    toExclusiveDate = addDays(parseDateKey(query.to), 1);
  } else {
    const range = rangeForPreset(preset, today);
    fromDate = range.from;
    toExclusiveDate = range.toExclusive;
    previousFromDate = range.previousFrom;
  }

  const fromInstant = localMidnight(fromDate, timezone);
  const toInstant = localMidnight(toExclusiveDate, timezone);
  if (toInstant <= fromInstant) throw new ValidationError('Report to date must be on or after from date');
  if ((toInstant.getTime() - fromInstant.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
    throw new ValidationError('Report range cannot exceed 24 months');
  }

  const effectiveToInstant = new Date(Math.min(toInstant.getTime(), now.getTime()));
  const comparisonFromInstant = previousFromDate ? localMidnight(previousFromDate, timezone) : null;
  const previousFullEnd = previousFromDate ? fromInstant : null;
  const comparisonToInstant =
    comparisonFromInstant && previousFullEnd
      ? new Date(
          Math.min(
            previousFullEnd.getTime(),
            comparisonFromInstant.getTime() + (effectiveToInstant.getTime() - fromInstant.getTime()),
          ),
        )
      : null;

  return {
    preset,
    timezone,
    from: fromInstant.toISOString(),
    to: toInstant.toISOString(),
    effectiveTo: effectiveToInstant.toISOString(),
    fromDate: dateKey(fromDate),
    toDate: dateKey(addDays(toExclusiveDate, -1)),
    toDateExclusive: dateKey(toExclusiveDate),
    comparisonFrom: comparisonFromInstant?.toISOString() ?? null,
    comparisonTo: comparisonToInstant?.toISOString() ?? null,
    bucket: bucketFor(fromInstant, toInstant),
    fromInstant,
    toInstant,
    effectiveToInstant,
    comparisonFromInstant,
    comparisonToInstant,
  };
}

export function publicReportPeriod(period: ResolvedReportPeriod) {
  const {
    fromInstant: _fromInstant,
    toInstant: _toInstant,
    effectiveToInstant: _effectiveToInstant,
    comparisonFromInstant: _comparisonFromInstant,
    comparisonToInstant: _comparisonToInstant,
    toDateExclusive: _toDateExclusive,
    ...publicPeriod
  } = period;
  return publicPeriod;
}

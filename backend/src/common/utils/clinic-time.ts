/**
 * Timezone-aware helpers for scheduling.
 *
 * Appointments are stored as UTC instants; the clinic's working hours are
 * wall-clock times in its own IANA timezone. Bridging the two with manual
 * offset arithmetic breaks twice a year, so the conversion goes through
 * `Intl.DateTimeFormat`, which owns the tz database.
 */

export interface WallClock {
  /** 0 = Sunday … 6 = Saturday, in the clinic's timezone. */
  weekday: number;
  /** `HH:mm`, 24-hour, in the clinic's timezone. */
  time: string;
  /** Minutes since local midnight — convenient for range comparisons. */
  minutesOfDay: number;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    formatterCache.set(timezone, formatter);
  }
  return formatter;
}

/** What the clinic's wall clock shows at a given instant. */
export function toWallClock(instant: Date, timezone: string): WallClock {
  const parts = getFormatter(timezone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  // `hour12: false` can yield "24" at midnight in some ICU versions.
  const hour = read('hour') === '24' ? '00' : read('hour');
  const minute = read('minute');
  const weekday = WEEKDAYS[read('weekday')] ?? 0;

  return {
    weekday,
    time: `${hour}:${minute}`,
    minutesOfDay: Number(hour) * 60 + Number(minute),
  };
}

/** Parses `HH:mm` into minutes since midnight. Input is schema-validated. */
export function clockToMinutes(time: string): number {
  const [hours = '0', minutes = '0'] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** Stable local calendar key used by due-date workflows. */
export function clinicDateKey(instant: Date, timezone: string): string {
  let formatter = dateFormatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatterCache.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

/** Positive when `earlier` is overdue relative to `later`, by clinic calendar days. */
export function clinicCalendarDayDifference(earlier: Date, later: Date, timezone: string): number {
  const asUtcMidnight = (value: Date) => {
    const [year = 0, month = 1, day = 1] = clinicDateKey(value, timezone).split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((asUtcMidnight(later) - asUtcMidnight(earlier)) / 86_400_000);
}

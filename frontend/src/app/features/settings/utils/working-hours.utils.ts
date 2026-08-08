import {
  WEEKDAYS,
  type TimePeriod,
  type Weekday,
  type WeeklyWorkingHours,
} from '../models/clinic-settings.models';

/**
 * Pure helpers for the working-hours editor.
 *
 * Kept free of Angular so the validation rules — which must match the
 * backend's — can be unit-tested on their own.
 */

export function toMinutes(clock: string): number {
  const [hours = '0', minutes = '0'] = clock.split(':');
  return Number(hours) * 60 + Number(minutes);
}

export function toClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const hours = String(Math.floor(clamped / 60)).padStart(2, '0');
  return `${hours}:${String(clamped % 60).padStart(2, '0')}`;
}

export function isValidClock(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Deep copy — the editor mutates a draft, never the persisted snapshot. */
export function cloneWorkingHours(hours: WeeklyWorkingHours): WeeklyWorkingHours {
  return Object.fromEntries(
    WEEKDAYS.map((weekday) => [weekday, hours[weekday].map((period) => ({ ...period }))]),
  ) as WeeklyWorkingHours;
}

export function periodsEqual(a: TimePeriod[], b: TimePeriod[]): boolean {
  return (
    a.length === b.length &&
    a.every((period, index) => period.start === b[index]?.start && period.end === b[index]?.end)
  );
}

export function workingHoursEqual(a: WeeklyWorkingHours, b: WeeklyWorkingHours): boolean {
  return WEEKDAYS.every((weekday) => periodsEqual(a[weekday], b[weekday]));
}

export interface DayValidation {
  /** Index-aligned with the day's periods; `null` where the period is fine. */
  periodErrors: (string | null)[];
  /** Day-level problem, e.g. two shifts colliding. */
  dayError: string | null;
}

/**
 * Validates one day exactly as the backend does: well-formed times, start
 * before end, and no two periods overlapping.
 */
export function validateDay(periods: TimePeriod[]): DayValidation {
  const periodErrors = periods.map((period) => {
    if (!isValidClock(period.start) || !isValidClock(period.end)) {
      return 'Use a 24-hour time such as 08:00.';
    }
    if (toMinutes(period.start) >= toMinutes(period.end)) {
      return 'The closing time must be after the opening time.';
    }
    return null;
  });

  if (periodErrors.some((error) => error !== null)) {
    return { periodErrors, dayError: null };
  }

  const sorted = [...periods].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const overlaps = sorted.some((period, index) => {
    const previous = sorted[index - 1];
    return previous !== undefined && toMinutes(previous.end) > toMinutes(period.start);
  });

  return {
    periodErrors,
    dayError: overlaps ? 'Two opening periods on this day overlap.' : null,
  };
}

export function validateWeek(hours: WeeklyWorkingHours): Record<Weekday, DayValidation> {
  return Object.fromEntries(
    WEEKDAYS.map((weekday) => [weekday, validateDay(hours[weekday])]),
  ) as Record<Weekday, DayValidation>;
}

export function isWeekValid(hours: WeeklyWorkingHours): boolean {
  return WEEKDAYS.every((weekday) => {
    const validation = validateDay(hours[weekday]);
    return validation.dayError === null && validation.periodErrors.every((e) => e === null);
  });
}

/**
 * Suggests the next period for a day: a morning shift when empty, otherwise a
 * one-hour block starting an hour after the last one closes — which lands on a
 * typical lunch break without the user typing anything.
 */
export function suggestNextPeriod(periods: TimePeriod[]): TimePeriod {
  const last = periods[periods.length - 1];
  if (!last) {
    return { start: '08:00', end: '12:00' };
  }
  const start = Math.min(toMinutes(last.end) + 60, 22 * 60);
  return { start: toClock(start), end: toClock(Math.min(start + 240, 23 * 60 + 59)) };
}

export function summarizeDay(periods: TimePeriod[]): string {
  if (periods.length === 0) {
    return 'Closed';
  }
  return periods.map((period) => `${period.start} — ${period.end}`).join('  ·  ');
}

/** Total open minutes in the week; shown as a sanity check under the editor. */
export function weeklyOpenMinutes(hours: WeeklyWorkingHours): number {
  return WEEKDAYS.reduce(
    (total, weekday) =>
      total +
      hours[weekday].reduce(
        (dayTotal, period) =>
          dayTotal +
          (isValidClock(period.start) && isValidClock(period.end)
            ? Math.max(0, toMinutes(period.end) - toMinutes(period.start))
            : 0),
        0,
      ),
    0,
  );
}

export function formatMinutesAsHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

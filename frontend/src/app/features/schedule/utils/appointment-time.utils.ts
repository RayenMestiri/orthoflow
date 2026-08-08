/**
 * Centralized date helpers for the schedule.
 *
 * Instants cross the wire as ISO UTC strings and live in the app as `Date`
 * objects — never as sliced strings. Formatting for the eye goes through
 * `Intl`, so the clinic's locale conventions are respected.
 *
 * Every wall-clock conversion accepts the clinic's authoritative IANA timezone;
 * workstation timezone is never treated as clinic configuration.
 */

const MINUTE_MS = 60_000;

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * MINUTE_MS).toISOString();
}

export function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / MINUTE_MS);
}

function zonedParts(instant: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

/** `2026-08-10` in clinic wall-clock — feeds `<input type="date">`. */
export function toDateInputValue(iso: string, timeZone: string): string {
  const parts = zonedParts(new Date(iso), timeZone);
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}

/** `09:15` in clinic wall-clock — feeds `<input type="time">`. */
export function toTimeInputValue(iso: string, timeZone: string): string {
  const parts = zonedParts(new Date(iso), timeZone);
  return `${parts['hour']}:${parts['minute']}`;
}

/** Rebuilds a UTC instant from the drawer's clinic-local date + time inputs. */
export function fromDateAndTimeInputs(
  dateValue: string,
  timeValue: string,
  timeZone: string,
): string {
  const [year = 0, month = 1, day = 1] = dateValue.split('-').map(Number);
  const [hours = 0, minutes = 0] = timeValue.split(':').map(Number);
  const desired = Date.UTC(year, month - 1, day, hours, minutes);
  let candidate = desired;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = zonedParts(new Date(candidate), timeZone);
    const represented = Date.UTC(
      Number(actual['year']),
      Number(actual['month']) - 1,
      Number(actual['day']),
      Number(actual['hour']),
      Number(actual['minute']),
    );
    candidate += desired - represented;
  }
  return new Date(candidate).toISOString();
}

export function formatTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function formatLongDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}

export function formatShortDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en', { timeZone, day: 'numeric', month: 'short' }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function isSameClinicDay(iso: string, instant: Date, timeZone: string): boolean {
  return toDateInputValue(iso, timeZone) === toDateInputValue(instant.toISOString(), timeZone);
}

/** Today at the clinic front desk, as [00:00, 24:00) UTC instants. */
export function todayRange(timeZone: string): { start: Date; end: Date } {
  const today = toDateInputValue(new Date().toISOString(), timeZone);
  const [year = 0, month = 1, day = 1] = today.split('-').map(Number);
  const tomorrowDate = new Date(Date.UTC(year, month - 1, day + 1));
  const tomorrow = `${tomorrowDate.getUTCFullYear()}-${String(tomorrowDate.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getUTCDate()).padStart(2, '0')}`;
  return {
    start: new Date(fromDateAndTimeInputs(today, '00:00', timeZone)),
    end: new Date(fromDateAndTimeInputs(tomorrow, '00:00', timeZone)),
  };
}

/** Rounds an instant down to the slot grid (e.g. 15 minutes). */
export function snapToSlot(iso: string, slotMinutes: number): string {
  const slotMs = slotMinutes * MINUTE_MS;
  return new Date(Math.floor(new Date(iso).getTime() / slotMs) * slotMs).toISOString();
}

/** `HH:mm` → `HH:mm:ss` as FullCalendar expects for durations/times. */
export function toCalendarTime(clock: string): string {
  return `${clock}:00`;
}

export function minutesToDuration(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const rest = String(minutes % 60).padStart(2, '0');
  return `${hours}:${rest}:00`;
}

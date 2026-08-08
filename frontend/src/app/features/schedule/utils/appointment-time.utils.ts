/**
 * Centralized date helpers for the schedule.
 *
 * Instants cross the wire as ISO UTC strings and live in the app as `Date`
 * objects — never as sliced strings. Formatting for the eye goes through
 * `Intl`, so the clinic's locale conventions are respected.
 *
 * TIMEZONE NOTE (MVP): the calendar renders in the browser's timezone. The
 * clinic staff physically work at the clinic, so browser time and clinic time
 * agree in practice; the backend independently validates working hours in the
 * clinic's official IANA timezone, so a mismatched browser cannot create an
 * out-of-hours appointment. Rendering in the clinic timezone regardless of
 * browser becomes possible once FullCalendar's Temporal named-zone support is
 * adopted — the seam is `calendar-options` + this module, nothing else.
 */

const MINUTE_MS = 60_000;

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * MINUTE_MS).toISOString();
}

export function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / MINUTE_MS);
}

/** `2026-08-10` in *local* wall-clock — feeds `<input type="date">`. */
export function toDateInputValue(iso: string): string {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `09:15` in *local* wall-clock — feeds `<input type="time">`. */
export function toTimeInputValue(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Rebuilds an instant from the drawer's local date + time inputs. */
export function fromDateAndTimeInputs(dateValue: string, timeValue: string): string {
  const [year = 0, month = 1, day = 1] = dateValue.split('-').map(Number);
  const [hours = 0, minutes = 0] = timeValue.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Today at the clinic front desk, as [00:00, 24:00) local instants. */
export function todayRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
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

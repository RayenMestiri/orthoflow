/**
 * Clinic-calendar day boundaries.
 *
 * A clinic day is the day the *clinic* is living in, not the day UTC happens to
 * be in. A Tunis practice seeing its last patient at 19:00 local is still on
 * the same working day that UTC ended hours earlier, so bucketing by UTC
 * midnight would file that visit under tomorrow.
 *
 * Centralized here (AGENTS.md: one source of truth) because both the financial
 * workspace and the reception board ask the same question — "what counts as
 * today for this clinic?" — and two implementations would eventually disagree.
 *
 * Offsets are read from the zone itself via `Intl`, so daylight-saving changes
 * need no special case and no offset table has to be maintained.
 */

export interface ClinicDay {
  /** First instant of the clinic's calendar day. */
  start: Date;
  /** First instant of the next day — an exclusive upper bound. */
  end: Date;
}

/** How far the zone is ahead of UTC at a given instant, in milliseconds. */
export function zoneOffsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    // `hour12: false` can yield "24" at midnight in some ICU versions.
    read('hour') === 24 ? 0 : read('hour'),
    read('minute'),
    read('second'),
  );
  return asUtc - instant.getTime();
}

/** The clinic's calendar date at an instant, as `{ year, month, day }`. */
export function clinicCalendarDate(
  instant: Date,
  timezone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  return { year: read('year'), month: read('month'), day: read('day') };
}

/**
 * The clinic day containing `now`.
 *
 * Takes the naive local midnight and corrects it by the zone's offset at that
 * moment, which is what turns a wall-clock date into a real instant.
 */
export function clinicDayBounds(timezone: string, now: Date = new Date()): ClinicDay {
  const { year, month, day } = clinicCalendarDate(now, timezone);
  const naiveMidnight = Date.UTC(year, month - 1, day);
  const start = new Date(naiveMidnight - zoneOffsetMs(new Date(naiveMidnight), timezone));

  // Adding 24h to the *instant* rather than incrementing the date keeps the
  // bound correct across a DST transition, where a local day is 23 or 25 hours.
  const naiveNextMidnight = Date.UTC(year, month - 1, day + 1);
  const end = new Date(naiveNextMidnight - zoneOffsetMs(new Date(naiveNextMidnight), timezone));

  return { start, end };
}

/** Start of the clinic's calendar month containing `now`. */
export function clinicMonthStart(timezone: string, now: Date = new Date()): Date {
  const { year, month } = clinicCalendarDate(now, timezone);
  const naive = Date.UTC(year, month - 1, 1);
  return new Date(naive - zoneOffsetMs(new Date(naive), timezone));
}

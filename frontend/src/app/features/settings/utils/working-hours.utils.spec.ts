import { describe, expect, it } from 'vitest';
import type { WeeklyWorkingHours } from '../models/clinic-settings.models';
import {
  cloneWorkingHours,
  formatMinutesAsHours,
  isWeekValid,
  suggestNextPeriod,
  summarizeDay,
  validateDay,
  weeklyOpenMinutes,
  workingHoursEqual,
} from './working-hours.utils';

const SPLIT_WEEK: WeeklyWorkingHours = {
  monday: [
    { start: '08:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  tuesday: [{ start: '08:00', end: '13:00' }],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

describe('validateDay', () => {
  it('accepts a split shift', () => {
    const result = validateDay(SPLIT_WEEK.monday);

    expect(result.dayError).toBeNull();
    expect(result.periodErrors).toEqual([null, null]);
  });

  it('accepts a closed day', () => {
    expect(validateDay([])).toEqual({ periodErrors: [], dayError: null });
  });

  it('flags a period that closes before it opens', () => {
    const result = validateDay([{ start: '18:00', end: '08:00' }]);

    expect(result.periodErrors[0]).toContain('after the opening time');
  });

  it('flags a malformed time', () => {
    const result = validateDay([{ start: '8:00', end: '12:00' }]);

    expect(result.periodErrors[0]).toContain('24-hour time');
  });

  it('flags overlapping periods on the same day', () => {
    const result = validateDay([
      { start: '08:00', end: '13:00' },
      { start: '12:00', end: '18:00' },
    ]);

    expect(result.dayError).toContain('overlap');
  });

  it('allows periods that touch exactly', () => {
    const result = validateDay([
      { start: '08:00', end: '12:00' },
      { start: '12:00', end: '18:00' },
    ]);

    expect(result.dayError).toBeNull();
  });

  it('detects an overlap regardless of the order they were entered', () => {
    const result = validateDay([
      { start: '14:00', end: '18:00' },
      { start: '08:00', end: '15:00' },
    ]);

    expect(result.dayError).toContain('overlap');
  });
});

describe('isWeekValid', () => {
  it('accepts the split week', () => {
    expect(isWeekValid(SPLIT_WEEK)).toBe(true);
  });

  it('rejects a week with one bad day', () => {
    expect(isWeekValid({ ...SPLIT_WEEK, friday: [{ start: '18:00', end: '09:00' }] })).toBe(false);
  });
});

describe('cloneWorkingHours', () => {
  it('produces an independent copy', () => {
    const copy = cloneWorkingHours(SPLIT_WEEK);
    copy.monday[0]!.start = '09:00';

    expect(SPLIT_WEEK.monday[0]?.start).toBe('08:00');
    expect(workingHoursEqual(copy, SPLIT_WEEK)).toBe(false);
  });
});

describe('workingHoursEqual', () => {
  it('is true for an untouched copy and false after an edit', () => {
    expect(workingHoursEqual(cloneWorkingHours(SPLIT_WEEK), SPLIT_WEEK)).toBe(true);

    const edited = cloneWorkingHours(SPLIT_WEEK);
    edited.wednesday = [{ start: '08:00', end: '13:00' }];
    expect(workingHoursEqual(edited, SPLIT_WEEK)).toBe(false);
  });
});

describe('suggestNextPeriod', () => {
  it('opens the morning on an empty day', () => {
    expect(suggestNextPeriod([])).toEqual({ start: '08:00', end: '12:00' });
  });

  it('leaves an hour gap after the previous period — a lunch break', () => {
    expect(suggestNextPeriod([{ start: '08:00', end: '12:00' }]).start).toBe('13:00');
  });
});

describe('summaries', () => {
  it('describes a closed day', () => {
    expect(summarizeDay([])).toBe('Closed');
  });

  it('joins split shifts', () => {
    expect(summarizeDay(SPLIT_WEEK.monday)).toBe('08:00 — 12:00  ·  14:00 — 18:00');
  });

  it('totals the open minutes across the week', () => {
    // Monday 4 h + 4 h, Tuesday 5 h.
    expect(weeklyOpenMinutes(SPLIT_WEEK)).toBe(13 * 60);
    expect(formatMinutesAsHours(13 * 60)).toBe('13 h');
    expect(formatMinutesAsHours(90)).toBe('1 h 30 min');
  });

  it('ignores malformed periods when totalling', () => {
    expect(weeklyOpenMinutes({ ...SPLIT_WEEK, wednesday: [{ start: 'x', end: 'y' }] })).toBe(
      13 * 60,
    );
  });
});

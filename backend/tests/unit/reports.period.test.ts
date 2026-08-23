import { describe, expect, it } from 'vitest';
import { resolveReportPeriod } from '../../src/modules/reports/reports.period.js';

describe('report period resolution', () => {
  it('resolves the current month in the clinic timezone and clips elapsed data at now', () => {
    const now = new Date('2026-08-23T10:15:00.000Z');
    const period = resolveReportPeriod({ preset: 'this-month' }, 'Africa/Lagos', now);

    expect(period.from).toBe('2026-07-31T23:00:00.000Z');
    expect(period.to).toBe('2026-08-31T23:00:00.000Z');
    expect(period.effectiveTo).toBe(now.toISOString());
    expect(period.fromDate).toBe('2026-08-01');
    expect(period.toDate).toBe('2026-08-31');
    expect(period.comparisonFrom).toBe('2026-06-30T23:00:00.000Z');
    expect(period.bucket).toBe('day');
  });

  it('treats custom end dates as inclusive clinic calendar dates without comparison', () => {
    const period = resolveReportPeriod(
      { preset: 'custom', from: '2026-03-28', to: '2026-03-29' },
      'Europe/Paris',
      new Date('2026-04-10T12:00:00.000Z'),
    );

    expect(period.from).toBe('2026-03-27T23:00:00.000Z');
    expect(period.to).toBe('2026-03-29T22:00:00.000Z');
    expect(period.comparisonFrom).toBeNull();
    expect(period.comparisonTo).toBeNull();
  });

  it('uses month buckets for a six-month selection', () => {
    const period = resolveReportPeriod(
      { preset: 'last-6-months' },
      'Africa/Tunis',
      new Date('2026-08-23T10:15:00.000Z'),
    );
    expect(period.bucket).toBe('month');
  });

  it('rejects custom ranges longer than 24 months', () => {
    expect(() =>
      resolveReportPeriod(
        { preset: 'custom', from: '2023-01-01', to: '2026-08-01' },
        'UTC',
        new Date('2026-08-23T10:15:00.000Z'),
      ),
    ).toThrow('cannot exceed 24 months');
  });
});

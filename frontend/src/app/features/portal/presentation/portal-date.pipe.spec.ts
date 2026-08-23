import { describe, expect, it } from 'vitest';
import { PortalDatePipe } from './portal-date.pipe';

describe('PortalDatePipe', () => {
  const pipe = new PortalDatePipe();

  it('formats an instant in the authoritative clinic IANA timezone', () => {
    expect(pipe.transform('2026-01-01T23:30:00.000Z', 'Africa/Tunis', 'appointment')).toContain(
      '00:30',
    );
    expect(pipe.transform('2026-01-01T23:30:00.000Z', 'Africa/Tunis', 'appointment')).toContain(
      '2 Jan 2026',
    );
  });

  it('fails closed for invalid values or timezones', () => {
    expect(pipe.transform('not-a-date', 'Africa/Tunis')).toBe('—');
    expect(pipe.transform('2026-01-01T00:00:00.000Z', 'Invalid/Timezone')).toBe('—');
  });
});

import { describe, expect, it } from 'vitest';
import {
  clinicSettingsDtoSchema,
  timezoneSchema,
  updateGeneralSettingsBodySchema,
  updateSchedulingSettingsBodySchema,
  updateWorkingHoursBodySchema,
  weeklyWorkingHoursSchema,
} from '../../src/modules/clinics/clinic-settings.schema.js';
import {
  DEFAULT_CLINIC_SETTINGS,
  DEFAULT_WORKING_HOURS,
  WEEKDAYS,
} from '../../src/modules/clinics/clinic-settings.types.js';

/** A complete week, so tests can vary one day at a time. */
function weekWith(overrides: Partial<typeof DEFAULT_WORKING_HOURS> = {}) {
  return { ...DEFAULT_WORKING_HOURS, ...overrides };
}

describe('working hours validation', () => {
  it('accepts the split-shift default week', () => {
    const result = weeklyWorkingHoursSchema.safeParse(DEFAULT_WORKING_HOURS);

    expect(result.success).toBe(true);
    // Monday closes for lunch: two periods, not one long one.
    expect(DEFAULT_WORKING_HOURS.monday).toHaveLength(2);
    expect(DEFAULT_WORKING_HOURS.sunday).toEqual([]);
  });

  it('treats an empty day as closed', () => {
    const result = weeklyWorkingHoursSchema.safeParse(weekWith({ wednesday: [] }));

    expect(result.success).toBe(true);
  });

  it('rejects a period that ends before it starts', () => {
    const result = weeklyWorkingHoursSchema.safeParse(
      weekWith({ monday: [{ start: '18:00', end: '08:00' }] }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects a zero-length period', () => {
    const result = weeklyWorkingHoursSchema.safeParse(
      weekWith({ monday: [{ start: '09:00', end: '09:00' }] }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects overlapping periods on the same day', () => {
    const result = weeklyWorkingHoursSchema.safeParse(
      weekWith({
        monday: [
          { start: '08:00', end: '13:00' },
          { start: '12:00', end: '18:00' },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('must not overlap');
  });

  it('detects an overlap even when the periods arrive out of order', () => {
    const result = weeklyWorkingHoursSchema.safeParse(
      weekWith({
        monday: [
          { start: '14:00', end: '18:00' },
          { start: '08:00', end: '15:00' },
        ],
      }),
    );

    expect(result.success).toBe(false);
  });

  it('allows two periods that touch exactly without overlapping', () => {
    const result = weeklyWorkingHoursSchema.safeParse(
      weekWith({
        monday: [
          { start: '08:00', end: '12:00' },
          { start: '12:00', end: '18:00' },
        ],
      }),
    );

    expect(result.success).toBe(true);
  });

  it('rejects malformed clock strings', () => {
    for (const bad of ['8:00', '25:00', '08:60', 'morning', '0800']) {
      const result = weeklyWorkingHoursSchema.safeParse(
        weekWith({ monday: [{ start: bad, end: '18:00' }] }),
      );
      expect(result.success, `${bad} should be rejected`).toBe(false);
    }
  });

  it('requires every weekday to be present', () => {
    const { sunday: _sunday, ...incomplete } = DEFAULT_WORKING_HOURS;

    expect(updateWorkingHoursBodySchema.safeParse({ workingHours: incomplete }).success).toBe(
      false,
    );
  });

  it('accepts a full week through the request body schema', () => {
    const result = updateWorkingHoursBodySchema.safeParse({
      workingHours: DEFAULT_WORKING_HOURS,
    });

    expect(result.success).toBe(true);
    expect(Object.keys(result.data?.workingHours ?? {})).toHaveLength(WEEKDAYS.length);
  });
});

describe('scheduling policy validation', () => {
  const valid = DEFAULT_CLINIC_SETTINGS.scheduling;

  it('accepts the defaults', () => {
    expect(updateSchedulingSettingsBodySchema.safeParse(valid).success).toBe(true);
    expect(valid.slotIntervalMinutes).toBe(15);
    expect(valid.defaultConcurrentCapacity).toBe(2);
  });

  it('only allows approved slot intervals', () => {
    for (const minutes of [5, 10, 15, 20, 30]) {
      expect(
        updateSchedulingSettingsBodySchema.safeParse({ ...valid, slotIntervalMinutes: minutes })
          .success,
      ).toBe(true);
    }
    for (const minutes of [7, 12, 45, 60, 0, -15]) {
      expect(
        updateSchedulingSettingsBodySchema.safeParse({ ...valid, slotIntervalMinutes: minutes })
          .success,
        `${minutes} should be rejected`,
      ).toBe(false);
    }
  });

  it('requires capacity to be a sensible whole number of patients', () => {
    expect(
      updateSchedulingSettingsBodySchema.safeParse({ ...valid, defaultConcurrentCapacity: 0 })
        .success,
    ).toBe(false);
    expect(
      updateSchedulingSettingsBodySchema.safeParse({ ...valid, defaultConcurrentCapacity: 1.5 })
        .success,
    ).toBe(false);
    expect(
      updateSchedulingSettingsBodySchema.safeParse({ ...valid, defaultConcurrentCapacity: 99 })
        .success,
    ).toBe(false);
    expect(
      updateSchedulingSettingsBodySchema.safeParse({ ...valid, defaultConcurrentCapacity: 4 })
        .success,
    ).toBe(true);
  });

  it('bounds the default appointment duration', () => {
    expect(
      updateSchedulingSettingsBodySchema.safeParse({
        ...valid,
        defaultAppointmentDurationMinutes: 2,
      }).success,
    ).toBe(false);
    expect(
      updateSchedulingSettingsBodySchema.safeParse({
        ...valid,
        defaultAppointmentDurationMinutes: 600,
      }).success,
    ).toBe(false);
  });
});

describe('timezone validation', () => {
  it('accepts real IANA zones', () => {
    for (const zone of ['Africa/Tunis', 'Europe/Paris', 'UTC']) {
      expect(timezoneSchema.safeParse(zone).success, zone).toBe(true);
    }
  });

  it('rejects zones the runtime does not know', () => {
    // A regex would happily accept this shape — the tz database does not.
    expect(timezoneSchema.safeParse('Africa/Atlantis').success).toBe(false);
    expect(timezoneSchema.safeParse('GMT+1').success).toBe(false);
  });
});

describe('general settings validation', () => {
  it('requires at least one field', () => {
    expect(updateGeneralSettingsBodySchema.safeParse({}).success).toBe(false);
  });

  it('accepts a partial update', () => {
    const result = updateGeneralSettingsBodySchema.safeParse({ clinicName: 'Cabinet Al Amal' });

    expect(result.success).toBe(true);
  });

  it('allows clearing optional identity fields with null', () => {
    const result = updateGeneralSettingsBodySchema.safeParse({
      doctorDisplayName: null,
      logoUrl: null,
      city: null,
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unsupported language and a non-URL logo', () => {
    expect(updateGeneralSettingsBodySchema.safeParse({ defaultLanguage: 'de' }).success).toBe(
      false,
    );
    expect(updateGeneralSettingsBodySchema.safeParse({ logoUrl: 'not-a-url' }).success).toBe(false);
  });
});

describe('settings response contract', () => {
  it('serializes the documented shape', () => {
    const result = clinicSettingsDtoSchema.safeParse({
      clinicId: '652f1c9b8a1e4f0012ab34cd',
      general: {
        clinicName: 'Cabinet Al Amal',
        doctorDisplayName: 'Dr Nadia Khelifi',
        phone: null,
        email: null,
        addressLine1: null,
        city: null,
        postalCode: null,
        country: null,
        timezone: 'Africa/Tunis',
        logoUrl: null,
        defaultLanguage: 'fr',
      },
      workingHours: DEFAULT_WORKING_HOURS,
      scheduling: DEFAULT_CLINIC_SETTINGS.scheduling,
      careContinuity: DEFAULT_CLINIC_SETTINGS.careContinuity,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });
});

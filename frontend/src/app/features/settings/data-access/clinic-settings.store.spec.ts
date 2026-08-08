import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicSettings } from '../models/clinic-settings.models';
import { ClinicSettingsApiService } from './clinic-settings-api.service';
import { ClinicSettingsStore } from './clinic-settings.store';

/** The store reads problems through `getApiProblem`, which needs a real response. */
function apiError(code: string, message: string, status = 400): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { success: false, error: { code, message } } });
}

function buildSettings(overrides: Partial<ClinicSettings> = {}): ClinicSettings {
  return {
    clinicId: 'clinic-1',
    general: {
      clinicName: 'Cabinet Al Amal',
      doctorDisplayName: 'Dr Nadia Khelifi',
      phone: '+216 71 000 000',
      email: 'contact@al-amal.test',
      addressLine1: '12 Avenue Habib Bourguiba',
      city: 'Tunis',
      postalCode: '1000',
      country: 'TN',
      timezone: 'Africa/Tunis',
      logoUrl: null,
      defaultLanguage: 'fr',
    },
    workingHours: {
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
    },
    scheduling: {
      slotIntervalMinutes: 15,
      defaultAppointmentDurationMinutes: 30,
      defaultConcurrentCapacity: 2,
      allowOwnerOverbooking: true,
    },
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ClinicSettingsStore', () => {
  let store: ClinicSettingsStore;
  let api: {
    get: ReturnType<typeof vi.fn>;
    updateGeneral: ReturnType<typeof vi.fn>;
    updateWorkingHours: ReturnType<typeof vi.fn>;
    updateScheduling: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      get: vi.fn(() => of(buildSettings())),
      updateGeneral: vi.fn((input) =>
        of(buildSettings({ general: { ...buildSettings().general, ...input } })),
      ),
      updateWorkingHours: vi.fn((workingHours) => of(buildSettings({ workingHours }))),
      updateScheduling: vi.fn((scheduling) => of(buildSettings({ scheduling }))),
    };

    TestBed.configureTestingModule({
      providers: [ClinicSettingsStore, { provide: ClinicSettingsApiService, useValue: api }],
    });
    store = TestBed.inject(ClinicSettingsStore);
  });

  it('loads the configuration once and caches it', async () => {
    await store.load();
    await store.load();

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(store.isLoaded()).toBe(true);
    expect(store.settings()?.general.clinicName).toBe('Cabinet Al Amal');
  });

  it('refetches when explicitly forced', async () => {
    await store.load();
    await store.load(true);

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('surfaces a load failure instead of throwing', async () => {
    api.get.mockReturnValue(
      throwError(() => apiError('CLINIC_NOT_FOUND', 'Clinic not found', 404)),
    );

    await store.load();

    expect(store.error()).toBe('Clinic not found');
    expect(store.isLoaded()).toBe(false);
  });

  it('saves general settings and flags the section as saved', async () => {
    await store.load();

    const saved = await store.saveGeneral({ clinicName: 'Renamed clinic' });

    expect(saved).toBe(true);
    expect(api.updateGeneral).toHaveBeenCalledWith({ clinicName: 'Renamed clinic' });
    expect(store.settings()?.general.clinicName).toBe('Renamed clinic');
    expect(store.savedSection()).toBe('general');
    expect(store.savingSection()).toBeNull();
  });

  it('saves working hours including a closed day and a split shift', async () => {
    await store.load();
    const week = buildSettings().workingHours;
    week.wednesday = [];
    week.thursday = [
      { start: '08:00', end: '12:00' },
      { start: '14:00', end: '18:00' },
    ];

    const saved = await store.saveWorkingHours(week);

    expect(saved).toBe(true);
    expect(store.settings()?.workingHours.wednesday).toEqual([]);
    expect(store.settings()?.workingHours.thursday).toHaveLength(2);
    expect(store.savedSection()).toBe('working-hours');
  });

  it('saves scheduling policy including capacity', async () => {
    await store.load();

    await store.saveScheduling({
      slotIntervalMinutes: 30,
      defaultAppointmentDurationMinutes: 45,
      defaultConcurrentCapacity: 4,
      allowOwnerOverbooking: false,
    });

    expect(store.settings()?.scheduling).toMatchObject({
      slotIntervalMinutes: 30,
      defaultConcurrentCapacity: 4,
      allowOwnerOverbooking: false,
    });
  });

  it('reports a save failure and keeps the previous values', async () => {
    await store.load();
    api.updateScheduling.mockReturnValue(
      throwError(() => apiError('VALIDATION_ERROR', 'Capacity must be at least 1')),
    );

    const saved = await store.saveScheduling({
      slotIntervalMinutes: 15,
      defaultAppointmentDurationMinutes: 30,
      defaultConcurrentCapacity: 0,
      allowOwnerOverbooking: true,
    });

    expect(saved).toBe(false);
    expect(store.error()).toBe('Capacity must be at least 1');
    // Unchanged: a rejected save must not corrupt the displayed configuration.
    expect(store.settings()?.scheduling.defaultConcurrentCapacity).toBe(2);
    expect(store.savedSection()).toBeNull();
  });

  it('clears the cached snapshot on reset', async () => {
    await store.load();
    store.reset();

    expect(store.isLoaded()).toBe(false);
  });
});

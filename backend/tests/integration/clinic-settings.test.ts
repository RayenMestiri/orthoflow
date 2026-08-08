import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import { DEFAULT_WORKING_HOURS } from '../../src/modules/clinics/clinic-settings.types.js';
import {
  CLINIC_A,
  CLINIC_B,
  resetRepositoryMocks,
  resetTestState,
  testState,
} from '../helpers/repository-mocks.js';
import { authHeader, createTestApp } from '../helpers/test-app.js';

/**
 * Settings-only repository double.
 *
 * Deliberately local to this file rather than added to the shared
 * `repository-mocks` helper — the Schedule module is being built in parallel
 * against that file, and this milestone should not widen it.
 *
 * Built inside `vi.hoisted` because `vi.mock` factories run before imports, so
 * the double may not depend on anything imported at the top of this file.
 */
const { settingsRepositoryMock } = vi.hoisted(() => {
  const OWNING_CLINIC = '652f1c9b8a1e4f0012ab34cd';
  const FIXED_DATE = new Date('2026-01-01T09:00:00.000Z');

  /** `settings: undefined` mimics a clinic document written before this module. */
  const clinicRecord = (clinicId: string) => ({
    _id: { toString: () => clinicId },
    name: 'Cabinet Al Amal',
    slug: 'cabinet-al-amal',
    legalName: null,
    email: 'contact@al-amal.test',
    phone: '+216 71 000 000',
    address: {
      line1: '12 Avenue Habib Bourguiba',
      line2: null,
      city: 'Tunis',
      postalCode: '1000',
      country: 'TN',
    },
    timezone: 'Africa/Tunis',
    currency: 'TND',
    settings: undefined,
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  });

  // Only the owning clinic exists — asking as another clinic finds nothing,
  // mirroring the tenancy-scoped Mongo filter.
  const scoped = (clinicId: string) => (clinicId === OWNING_CLINIC ? clinicRecord(clinicId) : null);

  return {
    settingsRepositoryMock: {
      findClinic: vi.fn(async (clinicId: string) => scoped(clinicId)),
      updateGeneral: vi.fn(async (clinicId: string) => scoped(clinicId)),
      updateWorkingHours: vi.fn(async (clinicId: string) => scoped(clinicId)),
      updateScheduling: vi.fn(async (clinicId: string) => scoped(clinicId)),
    },
  };
});

vi.mock('../../src/modules/users/user.repository.js', async () => ({
  userRepository: (await import('../helpers/repository-mocks.js')).userRepositoryMock,
}));
vi.mock('../../src/modules/auth/auth-session.repository.js', async () => ({
  authSessionRepository: (await import('../helpers/repository-mocks.js'))
    .authSessionRepositoryMock,
}));
vi.mock('../../src/modules/memberships/membership.repository.js', async () => ({
  membershipRepository: (await import('../helpers/repository-mocks.js')).membershipRepositoryMock,
}));
vi.mock('../../src/modules/clinics/clinic.repository.js', async () => ({
  clinicRepository: (await import('../helpers/repository-mocks.js')).clinicRepositoryMock,
}));
vi.mock('../../src/modules/audit-logs/audit-log.repository.js', async () => ({
  auditLogRepository: (await import('../helpers/repository-mocks.js')).auditLogRepositoryMock,
}));
vi.mock('../../src/modules/clinics/clinic-settings.repository.js', () => ({
  clinicSettingsRepository: settingsRepositoryMock,
}));

const VALID_SCHEDULING = {
  slotIntervalMinutes: 15,
  defaultAppointmentDurationMinutes: 30,
  defaultConcurrentCapacity: 2,
  allowOwnerOverbooking: true,
};

describe('clinic settings API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetTestState();
    resetRepositoryMocks();
    for (const fn of Object.values(settingsRepositoryMock)) {
      fn.mockClear();
    }
  });

  // --- reads ---------------------------------------------------------------

  it('returns the effective configuration for the owner', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/clinic/settings',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(settingsRepositoryMock.findClinic).toHaveBeenCalledWith(CLINIC_A);
    expect(response.json().data).toMatchObject({
      clinicId: CLINIC_A,
      general: { clinicName: 'Cabinet Al Amal', timezone: 'Africa/Tunis', defaultLanguage: 'fr' },
      scheduling: { slotIntervalMinutes: 15, defaultConcurrentCapacity: 2 },
    });
  });

  it('falls back to documented defaults for a clinic with no stored settings', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/clinic/settings',
      headers: authHeader(),
    });

    // The stub returns `settings: undefined`, as an older clinic document would.
    const body = response.json().data;
    expect(body.workingHours.monday).toEqual(DEFAULT_WORKING_HOURS.monday);
    expect(body.workingHours.sunday).toEqual([]);
    expect(body.scheduling.allowOwnerOverbooking).toBe(true);
  });

  it('lets a secretary read the configuration', async () => {
    testState.membershipRole = CLINIC_ROLES.SECRETARY;

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/clinic/settings',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
  });

  it('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/clinic/settings' });

    expect(response.statusCode).toBe(401);
  });

  // --- tenancy --------------------------------------------------------------

  it('refuses a clinic the caller does not belong to', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/clinic/settings',
      headers: { ...authHeader(), 'x-clinic-id': CLINIC_B },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('CLINIC_ACCESS_DENIED');
    expect(settingsRepositoryMock.findClinic).not.toHaveBeenCalled();
  });

  it('never accepts a clinic id from the payload', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinic/settings/general',
      headers: authHeader(),
      payload: { clinicName: 'Renamed', clinicId: CLINIC_B },
    });

    expect(response.statusCode).toBe(200);
    expect(settingsRepositoryMock.updateGeneral).toHaveBeenCalledWith(
      CLINIC_A,
      expect.objectContaining({ clinicName: 'Renamed' }),
    );
  });

  // --- owner-only writes ----------------------------------------------------

  it('lets the owner update general settings', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinic/settings/general',
      headers: authHeader(),
      payload: { clinicName: 'Cabinet Al Amal', timezone: 'Africa/Tunis' },
    });

    expect(response.statusCode).toBe(200);
  });

  it('lets the owner update working hours with split shifts', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinic/settings/working-hours',
      headers: authHeader(),
      payload: { workingHours: DEFAULT_WORKING_HOURS },
    });

    expect(response.statusCode).toBe(200);
    expect(settingsRepositoryMock.updateWorkingHours).toHaveBeenCalledWith(
      CLINIC_A,
      expect.objectContaining({ monday: DEFAULT_WORKING_HOURS.monday }),
    );
  });

  it('lets the owner update scheduling policy', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinic/settings/scheduling',
      headers: authHeader(),
      payload: { ...VALID_SCHEDULING, defaultConcurrentCapacity: 3 },
    });

    expect(response.statusCode).toBe(200);
    expect(settingsRepositoryMock.updateScheduling).toHaveBeenCalledWith(
      CLINIC_A,
      expect.objectContaining({ defaultConcurrentCapacity: 3 }),
    );
  });

  it.each([
    ['general', { clinicName: 'Hijacked' }],
    ['working-hours', { workingHours: DEFAULT_WORKING_HOURS }],
    ['scheduling', VALID_SCHEDULING],
  ])('blocks a secretary from writing %s settings', async (section, payload) => {
    testState.membershipRole = CLINIC_ROLES.SECRETARY;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/clinic/settings/${section}`,
      headers: authHeader(),
      payload,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(settingsRepositoryMock.updateGeneral).not.toHaveBeenCalled();
    expect(settingsRepositoryMock.updateWorkingHours).not.toHaveBeenCalled();
    expect(settingsRepositoryMock.updateScheduling).not.toHaveBeenCalled();
  });

  it('blocks an assistant from writing settings', async () => {
    testState.membershipRole = CLINIC_ROLES.ASSISTANT;

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinic/settings/scheduling',
      headers: authHeader(),
      payload: VALID_SCHEDULING,
    });

    expect(response.statusCode).toBe(403);
  });

  // --- server-side validation ----------------------------------------------

  it('rejects an out-of-range capacity', async () => {
    for (const capacity of [0, 99, 2.5]) {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/clinic/settings/scheduling',
        headers: authHeader(),
        payload: { ...VALID_SCHEDULING, defaultConcurrentCapacity: capacity },
      });

      expect(response.statusCode, `capacity ${capacity}`).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect(settingsRepositoryMock.updateScheduling).not.toHaveBeenCalled();
  });

  it('rejects an unapproved slot interval', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinic/settings/scheduling',
      headers: authHeader(),
      payload: { ...VALID_SCHEDULING, slotIntervalMinutes: 7 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects an inverted time range', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinic/settings/working-hours',
      headers: authHeader(),
      payload: {
        workingHours: { ...DEFAULT_WORKING_HOURS, monday: [{ start: '18:00', end: '08:00' }] },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(settingsRepositoryMock.updateWorkingHours).not.toHaveBeenCalled();
  });

  it('rejects overlapping periods on the same day', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinic/settings/working-hours',
      headers: authHeader(),
      payload: {
        workingHours: {
          ...DEFAULT_WORKING_HOURS,
          monday: [
            { start: '08:00', end: '13:00' },
            { start: '12:00', end: '18:00' },
          ],
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toContain('overlap');
  });

  it('rejects an unknown timezone', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinic/settings/general',
      headers: authHeader(),
      payload: { timezone: 'Africa/Atlantis' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects an empty general payload', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinic/settings/general',
      headers: authHeader(),
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });
});

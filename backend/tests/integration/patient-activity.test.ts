import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import {
  CLINIC_A,
  PATIENT_ID,
  patientActivityRepositoryMock,
  patientRepositoryMock,
  resetRepositoryMocks,
  resetTestState,
  testState,
} from '../helpers/repository-mocks.js';
import { authHeader, createTestApp } from '../helpers/test-app.js';

vi.mock('../../src/modules/users/user.repository.js', async () => ({
  userRepository: (await import('../helpers/repository-mocks.js')).userRepositoryMock,
}));
vi.mock('../../src/modules/auth/auth-session.repository.js', async () => ({
  authSessionRepository: (await import('../helpers/repository-mocks.js')).authSessionRepositoryMock,
}));
vi.mock('../../src/modules/memberships/membership.repository.js', async () => ({
  membershipRepository: (await import('../helpers/repository-mocks.js')).membershipRepositoryMock,
}));
vi.mock('../../src/modules/clinics/clinic.repository.js', async () => ({
  clinicRepository: (await import('../helpers/repository-mocks.js')).clinicRepositoryMock,
}));
vi.mock('../../src/modules/patients/patient.repository.js', async () => ({
  patientRepository: (await import('../helpers/repository-mocks.js')).patientRepositoryMock,
}));
vi.mock('../../src/modules/patients/patient-activity.repository.js', async () => ({
  patientActivityRepository: (await import('../helpers/repository-mocks.js'))
    .patientActivityRepositoryMock,
}));
vi.mock('../../src/modules/audit-logs/audit-log.repository.js', async () => ({
  auditLogRepository: (await import('../helpers/repository-mocks.js')).auditLogRepositoryMock,
}));

describe('patient activity API', () => {
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
  });

  it('returns 401 for an unauthenticated request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/patients/${PATIENT_ID}/activity`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when the patient does not belong to the clinic', async () => {
    patientRepositoryMock.findByIdInClinic.mockResolvedValueOnce(null);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/patients/${PATIENT_ID}/activity`,
      headers: authHeader(),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('PATIENT_NOT_FOUND');
  });

  it('returns 400 for an invalid filter parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/patients/${PATIENT_ID}/activity?filter=INVALID_FILTER`,
      headers: authHeader(),
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns paginated activity data with default ALL filter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/patients/${PATIENT_ID}/activity?page=1&limit=20`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([]);
    expect(response.json().pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 0,
      pages: 0,
    });
    expect(patientActivityRepositoryMock.listAudits).toHaveBeenCalledWith(
      CLINIC_A,
      PATIENT_ID,
      'ALL',
      expect.anything(),
      20,
    );
  });

  it('passes requested filter to activity service and repository', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/patients/${PATIENT_ID}/activity?filter=PAYMENTS`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(patientActivityRepositoryMock.listAudits).toHaveBeenCalledWith(
      CLINIC_A,
      PATIENT_ID,
      'PAYMENTS',
      expect.anything(),
      20,
    );
  });

  it('allows secretary access with appropriate permission', async () => {
    testState.membershipRole = CLINIC_ROLES.SECRETARY;
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/patients/${PATIENT_ID}/activity`,
      headers: authHeader(),
    });
    expect(response.statusCode).toBe(200);
  });
});

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES, MEMBERSHIP_STATUSES } from '../../src/common/constants/roles.js';
import {
  CLINIC_A,
  CLINIC_B,
  PATIENT_ID,
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
vi.mock('../../src/modules/guardians/guardian.repository.js', async () => ({
  guardianRepository: (await import('../helpers/repository-mocks.js')).guardianRepositoryMock,
}));
vi.mock('../../src/modules/guardians/patient-guardian.repository.js', async () => ({
  patientGuardianRepository: (await import('../helpers/repository-mocks.js'))
    .patientGuardianRepositoryMock,
}));
vi.mock('../../src/modules/audit-logs/audit-log.repository.js', async () => ({
  auditLogRepository: (await import('../helpers/repository-mocks.js')).auditLogRepositoryMock,
}));

/**
 * Tenant isolation is the single most important property of this backend: one
 * clinic must never read or write another clinic's patients. These tests attack
 * it from the three directions a client can actually try — the header, the URL
 * and the body.
 */
describe('patient tenancy', () => {
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

  it('scopes the query to the clinic the caller belongs to', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/patients',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(patientRepositoryMock.listByClinic).toHaveBeenCalledWith(
      CLINIC_A,
      expect.anything(),
      expect.anything(),
    );
  });

  it('refuses an x-clinic-id header pointing at a clinic the caller is not in', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/patients',
      headers: { ...authHeader(), 'x-clinic-id': CLINIC_B },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('CLINIC_ACCESS_DENIED');
    expect(patientRepositoryMock.listByClinic).not.toHaveBeenCalled();
  });

  it('ignores a clinicId smuggled into the request body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/patients',
      headers: authHeader(),
      payload: { firstName: 'Yasmine', lastName: 'Trabelsi', clinicId: CLINIC_B },
    });

    expect(response.statusCode).toBe(201);
    expect(patientRepositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC_A }),
    );
  });

  it('refuses a caller whose membership has been suspended', async () => {
    testState.membershipStatus = MEMBERSHIP_STATUSES.SUSPENDED;

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/patients',
      headers: { ...authHeader(), 'x-clinic-id': CLINIC_A },
    });

    expect(response.statusCode).toBe(403);
  });

  it('demands an explicit clinic when the caller works in several practices', async () => {
    testState.membershipClinicIds = [CLINIC_A, CLINIC_B];

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/patients',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('CLINIC_CONTEXT_AMBIGUOUS');
  });

  it('honours an explicit clinic choice for a multi-clinic practitioner', async () => {
    testState.membershipClinicIds = [CLINIC_A, CLINIC_B];

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/patients',
      headers: { ...authHeader(), 'x-clinic-id': CLINIC_B },
    });

    expect(response.statusCode).toBe(200);
    expect(patientRepositoryMock.listByClinic).toHaveBeenCalledWith(
      CLINIC_B,
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('patient authorization', () => {
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

  it('lets an assistant read patients', async () => {
    testState.membershipRole = CLINIC_ROLES.ASSISTANT;

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/patients',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
  });

  it('stops an assistant from creating a patient', async () => {
    testState.membershipRole = CLINIC_ROLES.ASSISTANT;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/patients',
      headers: authHeader(),
      payload: { firstName: 'Yasmine', lastName: 'Trabelsi' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(patientRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('stops a secretary from archiving a patient', async () => {
    testState.membershipRole = CLINIC_ROLES.SECRETARY;

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/patients/${PATIENT_ID}/archive`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(403);
    expect(patientRepositoryMock.archive).not.toHaveBeenCalled();
  });

  it('accepts an action POST that carries no body', async () => {
    // Browser clients send `Content-Type: application/json` even with no
    // payload; Fastify's default parser would reject that before routing.
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/patients/${PATIENT_ID}/archive`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    expect(patientRepositoryMock.archive).toHaveBeenCalledWith(
      PATIENT_ID,
      CLINIC_A,
      expect.any(String),
    );
  });

  it('still rejects malformed JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/patients',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: '{not json',
    });

    expect(response.statusCode).toBe(400);
  });

  it('validates the payload before any repository is touched', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/patients',
      headers: authHeader(),
      payload: { firstName: '', lastName: 'Trabelsi', birthDate: '2999-01-01' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(patientRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed patient id in the URL', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/patients/not-an-object-id',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(400);
  });
});

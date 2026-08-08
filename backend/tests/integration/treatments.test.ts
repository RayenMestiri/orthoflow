import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import {
  CLINIC_A,
  CLINIC_B,
  PATIENT_ID,
  TREATMENT_ID,
  patientRepositoryMock,
  resetRepositoryMocks,
  resetTestState,
  testState,
  treatmentRecord,
  treatmentRepositoryMock,
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
vi.mock('../../src/modules/treatments/treatment.repository.js', async () => ({
  treatmentRepository: (await import('../helpers/repository-mocks.js')).treatmentRepositoryMock,
}));
vi.mock('../../src/modules/audit-logs/audit-log.repository.js', async () => ({
  auditLogRepository: (await import('../helpers/repository-mocks.js')).auditLogRepositoryMock,
}));

const TREATMENTS_URL = `/api/v1/patients/${PATIENT_ID}/treatments`;

/**
 * HTTP-level checks for the treatment domain: the tenant boundary, the role
 * table and the validation layer, exercised through the real routing stack.
 */
describe('treatment tenancy', () => {
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

  it('scopes the patient history to the caller clinic', async () => {
    const response = await app.inject({
      method: 'GET',
      url: TREATMENTS_URL,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(treatmentRepositoryMock.listByPatient).toHaveBeenCalledWith(
      PATIENT_ID,
      CLINIC_A,
      expect.anything(),
    );
  });

  it('refuses an x-clinic-id header pointing at a clinic the caller is not in', async () => {
    const response = await app.inject({
      method: 'GET',
      url: TREATMENTS_URL,
      headers: { ...authHeader(), 'x-clinic-id': CLINIC_B },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('CLINIC_ACCESS_DENIED');
    expect(treatmentRepositoryMock.listByPatient).not.toHaveBeenCalled();
  });

  it('ignores a clinicId or doctorId smuggled into the request body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: TREATMENTS_URL,
      headers: authHeader(),
      payload: { type: 'CLEAR_ALIGNERS', clinicId: CLINIC_B, doctorId: PATIENT_ID },
    });

    expect(response.statusCode).toBe(201);
    expect(treatmentRepositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC_A, patientId: PATIENT_ID }),
    );
  });

  it('hides a treatment belonging to another clinic behind a 404', async () => {
    treatmentRepositoryMock.findByIdInClinic.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/treatments/${TREATMENT_ID}`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('TREATMENT_NOT_FOUND');
  });

  it('returns 404 when the patient belongs to another clinic', async () => {
    patientRepositoryMock.findByIdInClinic.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'GET',
      url: TREATMENTS_URL,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('PATIENT_NOT_FOUND');
  });
});

describe('treatment authorization', () => {
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

  it('lets a secretary read the treatment plan', async () => {
    testState.membershipRole = CLINIC_ROLES.SECRETARY;

    const response = await app.inject({
      method: 'GET',
      url: TREATMENTS_URL,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
  });

  it('stops a secretary from planning treatment', async () => {
    testState.membershipRole = CLINIC_ROLES.SECRETARY;

    const response = await app.inject({
      method: 'POST',
      url: TREATMENTS_URL,
      headers: authHeader(),
      payload: { type: 'METAL_BRACES' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(treatmentRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('stops an assistant from starting treatment', async () => {
    testState.membershipRole = CLINIC_ROLES.ASSISTANT;

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/treatments/${TREATMENT_ID}/start`,
      headers: authHeader(),
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(treatmentRepositoryMock.changeStatus).not.toHaveBeenCalled();
  });

  it('keeps milestone creation clinical by rejecting an assistant', async () => {
    testState.membershipRole = CLINIC_ROLES.ASSISTANT;

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/treatments/${TREATMENT_ID}/milestones`,
      headers: authHeader(),
      payload: { type: 'WIRE_ADJUSTMENT', title: 'Wire adjustment' },
    });

    expect(response.statusCode).toBe(403);
    expect(treatmentRepositoryMock.createMilestone).not.toHaveBeenCalled();
  });

  it('lets a practitioner start a planned treatment', async () => {
    testState.membershipRole = CLINIC_ROLES.ORTHODONTIST;

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/treatments/${TREATMENT_ID}/start`,
      headers: authHeader(),
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('ACTIVE');
  });

  it('lets a practitioner record a persisted milestone', async () => {
    testState.membershipRole = CLINIC_ROLES.ORTHODONTIST;
    treatmentRepositoryMock.findByIdInClinic.mockResolvedValueOnce({
      ...treatmentRecord(CLINIC_A),
      status: 'ACTIVE' as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/treatments/${TREATMENT_ID}/milestones`,
      headers: authHeader(),
      payload: { type: 'APPLIANCE_FITTED', title: 'Appliance fitted' },
    });

    expect(response.statusCode).toBe(201);
    expect(treatmentRepositoryMock.createMilestone).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC_A, type: 'APPLIANCE_FITTED' }),
    );
  });

  it('retrieves milestones through a clinic-scoped treatment', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/treatments/${TREATMENT_ID}/milestones`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(treatmentRepositoryMock.listMilestonesByTreatment).toHaveBeenCalledWith(
      TREATMENT_ID,
      CLINIC_A,
      expect.anything(),
    );
  });
});

describe('treatment validation', () => {
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

  it('rejects a payload with no treatment type before any repository is touched', async () => {
    const response = await app.inject({
      method: 'POST',
      url: TREATMENTS_URL,
      headers: authHeader(),
      payload: { notes: 'Class II' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(treatmentRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('refuses an automatic lifecycle milestone posted manually', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/treatments/${TREATMENT_ID}/milestones`,
      headers: authHeader(),
      payload: { type: 'TREATMENT_PAUSED', title: 'Treatment paused' },
    });

    expect(response.statusCode).toBe(400);
    expect(treatmentRepositoryMock.createMilestone).not.toHaveBeenCalled();
  });

  it('rejects a malformed treatment id in the URL', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/treatments/not-an-object-id',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(400);
  });

  it('refuses an invalid transition with a business-rule error', async () => {
    // The stored treatment is PLANNED, so pausing it is not a legal move.
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/treatments/${TREATMENT_ID}/pause`,
      headers: authHeader(),
      payload: {},
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('TREATMENT_INVALID_STATUS_TRANSITION');
    expect(treatmentRepositoryMock.changeStatus).not.toHaveBeenCalled();
  });

  it('refuses to start a course while another is already running', async () => {
    treatmentRepositoryMock.findActiveForPatient.mockResolvedValueOnce(
      treatmentRecord(CLINIC_A, '652f1c9b8a1e4f0012ab7777') as never,
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/treatments/${TREATMENT_ID}/start`,
      headers: authHeader(),
      payload: {},
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('TREATMENT_ALREADY_ACTIVE');
  });

  it('accepts an action POST that carries no body', async () => {
    // Browser clients send `Content-Type: application/json` even with no payload.
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/treatments/${TREATMENT_ID}/start`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
  });
});

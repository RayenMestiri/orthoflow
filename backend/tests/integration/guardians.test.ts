import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import {
  CLINIC_A,
  CLINIC_B,
  GUARDIAN_ID,
  PATIENT_ID,
  guardianRepositoryMock,
  auditLogRepositoryMock,
  patientGuardianRepositoryMock,
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

describe('patient guardians', () => {
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

  it('creates a guardian and tenant-scoped many-to-many relationship', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/patients/${PATIENT_ID}/guardians`,
      headers: authHeader(),
      payload: {
        firstName: 'Leila',
        lastName: 'Trabelsi',
        relationship: 'MOTHER',
        phone: '+216 20 100 200',
        isPrimary: true,
        financiallyResponsible: true,
        contactPreference: 'PHONE',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(guardianRepositoryMock.create).toHaveBeenCalledWith(
      CLINIC_A,
      expect.any(String),
      expect.objectContaining({ relationship: 'MOTHER' }),
      undefined,
    );
    expect(patientGuardianRepositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC_A, patientId: PATIENT_ID, isPrimary: true }),
      undefined,
    );
  });

  it('updates guardian and relationship details through the scoped link', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/patients/${PATIENT_ID}/guardians/${GUARDIAN_ID}`,
      headers: authHeader(),
      payload: { phone: '+216 22 222 222', contactPreference: 'EMAIL' },
    });

    expect(response.statusCode).toBe(200);
    expect(patientGuardianRepositoryMock.findByPatientAndGuardian).toHaveBeenCalledWith(
      PATIENT_ID,
      GUARDIAN_ID,
      CLINIC_A,
    );
  });

  it('does not reveal a patient from another clinic even when its id is known', async () => {
    patientRepositoryMock.findByIdInClinic.mockResolvedValueOnce(null);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/patients/${PATIENT_ID}`,
      headers: { ...authHeader(), 'x-clinic-id': CLINIC_A },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('PATIENT_NOT_FOUND');
    expect(patientRepositoryMock.findByIdInClinic).toHaveBeenCalledWith(PATIENT_ID, CLINIC_A);
    expect(patientRepositoryMock.findByIdInClinic).not.toHaveBeenCalledWith(PATIENT_ID, CLINIC_B);
  });

  it('keeps assistant access read-only', async () => {
    testState.membershipRole = CLINIC_ROLES.ASSISTANT;
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/patients/${PATIENT_ID}/guardians`,
      headers: authHeader(),
      payload: { firstName: 'Leila', lastName: 'Trabelsi', relationship: 'MOTHER' },
    });

    expect(response.statusCode).toBe(403);
    expect(guardianRepositoryMock.create).not.toHaveBeenCalled();
  });


  it('rejects an unsupported relationship before persistence', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/patients/${PATIENT_ID}/guardians`,
      headers: authHeader(),
      payload: { firstName: 'Leila', lastName: 'Trabelsi', relationship: 'PARENT' },
    });

    expect(response.statusCode).toBe(400);
    expect(guardianRepositoryMock.create).not.toHaveBeenCalled();
  });
});

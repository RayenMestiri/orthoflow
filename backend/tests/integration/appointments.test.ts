import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import {
  APPOINTMENT_ID,
  APPOINTMENT_TYPE_ID,
  appointmentRepositoryMock,
  CLINIC_A,
  CLINIC_B,
  PATIENT_ID,
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
vi.mock('../../src/modules/appointments/appointment.repository.js', async () => ({
  appointmentRepository: (await import('../helpers/repository-mocks.js')).appointmentRepositoryMock,
}));
vi.mock('../../src/modules/appointment-types/appointment-type.repository.js', async () => ({
  appointmentTypeRepository: (await import('../helpers/repository-mocks.js'))
    .appointmentTypeRepositoryMock,
}));
vi.mock('../../src/modules/audit-logs/audit-log.repository.js', async () => ({
  auditLogRepository: (await import('../helpers/repository-mocks.js')).auditLogRepositoryMock,
}));
vi.mock('../../src/modules/notifications/notification.repository.js', () => ({
  communicationOutboxRepository: { enqueue: vi.fn(async () => undefined) },
  notificationRepository: {},
}));

/** Valid Monday-morning slot inside the default working hours (09:00 Tunis). */
const VALID_START = '2026-08-10T08:00:00.000Z';

/**
 * HTTP-level checks for the scheduling API: tenancy, role authorization and
 * validation wiring. Business rules (conflicts, transitions, working hours)
 * are covered by the service unit tests.
 */
describe('appointments API', () => {
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

  it('scopes the range query to the caller clinic', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/appointments?start=${VALID_START}&end=2026-08-11T08:00:00.000Z`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(appointmentRepositoryMock.listInRange).toHaveBeenCalledWith(CLINIC_A, expect.anything());
    const body = response.json();
    expect(body.data[0]).toMatchObject({
      clinicId: CLINIC_A,
      patient: { fullName: expect.any(String) },
      appointmentType: { name: 'Monthly control' },
    });
  });

  it('refuses an x-clinic-id header for a clinic the caller is not in', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/appointments?start=${VALID_START}&end=2026-08-11T08:00:00.000Z`,
      headers: { ...authHeader(), 'x-clinic-id': CLINIC_B },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('CLINIC_ACCESS_DENIED');
    expect(appointmentRepositoryMock.listInRange).not.toHaveBeenCalled();
  });

  it('rejects a range query with missing bounds', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/appointments',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('creates an appointment and stamps clinic and doctor server-side', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/appointments',
      headers: authHeader(),
      payload: {
        patientId: PATIENT_ID,
        appointmentTypeId: APPOINTMENT_TYPE_ID,
        startAt: VALID_START,
        // Hostile extras: both are server-owned and must be ignored.
        clinicId: CLINIC_B,
        doctorId: '652f1c9b8a1e4f0012ab9999',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(appointmentRepositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC_A }),
    );
    const created = appointmentRepositoryMock.create.mock.calls[0]?.[0] as unknown as {
      doctorId: string;
      durationMinutes: number;
    };
    // Doctor resolved from the clinic's owner membership, not the payload.
    expect(created.doctorId).not.toBe('652f1c9b8a1e4f0012ab9999');
    // Duration derived from the Monthly control type.
    expect(created.durationMinutes).toBe(15);
  });

  it('lets a secretary manage the diary', async () => {
    testState.membershipRole = CLINIC_ROLES.SECRETARY;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/appointments',
      headers: authHeader(),
      payload: {
        patientId: PATIENT_ID,
        appointmentTypeId: APPOINTMENT_TYPE_ID,
        startAt: VALID_START,
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it('keeps an assistant read-only on the diary', async () => {
    testState.membershipRole = CLINIC_ROLES.ASSISTANT;

    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/appointments?start=${VALID_START}&end=2026-08-11T08:00:00.000Z`,
      headers: authHeader(),
    });
    expect(read.statusCode).toBe(200);

    const write = await app.inject({
      method: 'POST',
      url: '/api/v1/appointments',
      headers: authHeader(),
      payload: {
        patientId: PATIENT_ID,
        appointmentTypeId: APPOINTMENT_TYPE_ID,
        startAt: VALID_START,
      },
    });
    expect(write.statusCode).toBe(403);
    expect(write.json().error.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(appointmentRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('moves an appointment through the status endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/appointments/${APPOINTMENT_ID}/status`,
      headers: authHeader(),
      payload: { status: 'CONFIRMED' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('CONFIRMED');
  });

  it('rejects CANCELLED through the status endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/appointments/${APPOINTMENT_ID}/status`,
      headers: authHeader(),
      payload: { status: 'CANCELLED' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('cancels with a reason through the cancel endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/appointments/${APPOINTMENT_ID}/cancel`,
      headers: authHeader(),
      payload: { reason: 'Patient called to cancel' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'Patient called to cancel',
    });
  });

  it('lists appointment types for the booking form', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/appointment-types',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toMatchObject({
      name: 'Monthly control',
      durationMinutes: 15,
    });
  });

  it('blocks a secretary from managing appointment types', async () => {
    testState.membershipRole = CLINIC_ROLES.SECRETARY;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/appointment-types',
      headers: authHeader(),
      payload: { name: 'Emergency', durationMinutes: 20 },
    });

    expect(response.statusCode).toBe(403);
  });
});

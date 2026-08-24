import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import { APPOINTMENT_STATUSES } from '../../src/modules/appointments/appointment.types.js';
import {
  APPOINTMENT_ID,
  CLINIC_A,
  PATIENT_ID,
  TREATMENT_ID,
  VISIT_ID,
  appointmentRecord,
  appointmentRepositoryMock,
  auditLogRepositoryMock,
  clinicalVisitRecord,
  clinicalVisitRepositoryMock,
  patientRecord,
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
vi.mock('../../src/modules/appointments/appointment.repository.js', async () => ({
  appointmentRepository: (await import('../helpers/repository-mocks.js')).appointmentRepositoryMock,
}));
vi.mock('../../src/modules/treatments/treatment.repository.js', async () => ({
  treatmentRepository: (await import('../helpers/repository-mocks.js')).treatmentRepositoryMock,
}));
vi.mock('../../src/modules/clinical-visits/clinical-visit.repository.js', async () => ({
  clinicalVisitRepository: (await import('../helpers/repository-mocks.js'))
    .clinicalVisitRepositoryMock,
}));
vi.mock('../../src/modules/audit-logs/audit-log.repository.js', async () => ({
  auditLogRepository: (await import('../helpers/repository-mocks.js')).auditLogRepositoryMock,
}));

describe('clinical visits API', () => {
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

    patientRepositoryMock.findByIdInClinic.mockImplementation(
      async (patientId: string, clinicId: string) => patientRecord(clinicId, patientId),
    );

    appointmentRepositoryMock.findByIdInClinic.mockImplementation(
      async (appointmentId: string, clinicId: string) => ({
        ...appointmentRecord(clinicId, appointmentId),
        status: APPOINTMENT_STATUSES.IN_TREATMENT,
        treatmentStartedAt: new Date('2026-08-10T08:05:00.000Z'),
      }),
    );

    treatmentRepositoryMock.findByIdInClinic.mockImplementation(
      async (treatmentId: string, clinicId: string) => treatmentRecord(clinicId, treatmentId),
    );

    clinicalVisitRepositoryMock.findByIdInClinic.mockImplementation(
      async (visitId: string, clinicId: string) => clinicalVisitRecord(clinicId, visitId),
    );

    clinicalVisitRepositoryMock.findByAppointment.mockResolvedValue(null);
    clinicalVisitRepositoryMock.listByPatient.mockResolvedValue({ items: [], total: 0 });

    clinicalVisitRepositoryMock.create.mockImplementation(async (input: { clinicId: string }) =>
      clinicalVisitRecord(input.clinicId),
    );

    clinicalVisitRepositoryMock.update.mockImplementation(
      async (visitId: string, clinicId: string) => clinicalVisitRecord(clinicId, visitId),
    );

    clinicalVisitRepositoryMock.complete.mockImplementation(
      async (visitId: string, clinicId: string) => ({
        ...clinicalVisitRecord(clinicId, visitId),
        status: 'COMPLETED',
      }),
    );
  });

  describe('POST /appointments/:appointmentId/clinical-visit', () => {
    it('returns 401 for an unauthenticated caller', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/appointments/' + APPOINTMENT_ID + '/clinical-visit',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 403 when the caller lacks CLINICAL_VISIT_MANAGE', async () => {
      testState.membershipRole = CLINIC_ROLES.SECRETARY;
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/appointments/' + APPOINTMENT_ID + '/clinical-visit',
        headers: authHeader(),
      });
      expect(response.statusCode).toBe(403);
    });

    it('creates and returns a new DRAFT visit for an IN_TREATMENT appointment', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/appointments/' + APPOINTMENT_ID + '/clinical-visit',
        headers: authHeader(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.status).toBe('DRAFT');
      expect(clinicalVisitRepositoryMock.create).toHaveBeenCalled();
      expect(auditLogRepositoryMock.create).toHaveBeenCalled();
    });

    it('returns the existing visit without creating a duplicate', async () => {
      clinicalVisitRepositoryMock.findByAppointment.mockResolvedValue(
        clinicalVisitRecord(CLINIC_A),
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/appointments/' + APPOINTMENT_ID + '/clinical-visit',
        headers: authHeader(),
      });
      expect(response.statusCode).toBe(200);
      expect(clinicalVisitRepositoryMock.create).not.toHaveBeenCalled();
      expect(response.json().data.id).toBe(VISIT_ID);
    });

    it('returns 422 when the appointment is not IN_TREATMENT', async () => {
      appointmentRepositoryMock.findByIdInClinic.mockResolvedValue({
        ...appointmentRecord(CLINIC_A, APPOINTMENT_ID),
        status: APPOINTMENT_STATUSES.WAITING,
        treatmentStartedAt: null,
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/appointments/' + APPOINTMENT_ID + '/clinical-visit',
        headers: authHeader(),
      });
      expect(response.statusCode).toBe(422);
    });

    it('returns 404 for an appointment not in the caller clinic', async () => {
      appointmentRepositoryMock.findByIdInClinic.mockResolvedValue(null);
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/appointments/' + APPOINTMENT_ID + '/clinical-visit',
        headers: authHeader(),
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('APPOINTMENT_NOT_FOUND');
    });
  });

  describe('GET /appointments/:appointmentId/clinical-visit', () => {
    it('returns 401 unauthenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/appointments/' + APPOINTMENT_ID + '/clinical-visit',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when no visit exists for the appointment', async () => {
      clinicalVisitRepositoryMock.findByAppointment.mockResolvedValue(null);
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/appointments/' + APPOINTMENT_ID + '/clinical-visit',
        headers: authHeader(),
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns the visit for an authorized caller', async () => {
      clinicalVisitRepositoryMock.findByAppointment.mockResolvedValue(
        clinicalVisitRecord(CLINIC_A),
      );
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/appointments/' + APPOINTMENT_ID + '/clinical-visit',
        headers: authHeader(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.status).toBe('DRAFT');
    });
  });

  describe('PATCH /clinical-visits/:visitId', () => {
    it('returns 403 for a caller without CLINICAL_VISIT_MANAGE', async () => {
      testState.membershipRole = CLINIC_ROLES.SECRETARY;
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/clinical-visits/' + VISIT_ID,
        headers: authHeader(),
        payload: { observations: 'Test' },
      });
      expect(response.statusCode).toBe(403);
    });

    it('accepts a partial update and emits an audit entry', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/clinical-visits/' + VISIT_ID,
        headers: authHeader(),
        payload: { observations: 'Alignment improving' },
      });
      expect(response.statusCode).toBe(200);
      expect(clinicalVisitRepositoryMock.update).toHaveBeenCalledWith(
        VISIT_ID,
        CLINIC_A,
        expect.objectContaining({ observations: 'Alignment improving' }),
        expect.any(String),
      );
      expect(auditLogRepositoryMock.create).toHaveBeenCalled();
    });

    it('returns 400 for an empty payload', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/clinical-visits/' + VISIT_ID,
        headers: authHeader(),
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when the visit is not in the caller clinic', async () => {
      clinicalVisitRepositoryMock.findByIdInClinic.mockResolvedValue(null);
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/clinical-visits/' + VISIT_ID,
        headers: authHeader(),
        payload: { doctorNote: 'Test' },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('CLINICAL_VISIT_NOT_FOUND');
    });

    it('rejects amendment to a completed visit by a non-owner', async () => {
      clinicalVisitRepositoryMock.findByIdInClinic.mockResolvedValue({
        ...clinicalVisitRecord(CLINIC_A),
        status: 'COMPLETED',
      } as never);
      testState.membershipRole = CLINIC_ROLES.ORTHODONTIST;
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/clinical-visits/' + VISIT_ID,
        headers: authHeader(),
        payload: { doctorNote: 'Amendment' },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('CLINICAL_VISIT_ALREADY_COMPLETED');
    });
  });

  describe('POST /clinical-visits/:visitId/complete', () => {
    it('returns 403 for a caller without CLINICAL_VISIT_MANAGE', async () => {
      testState.membershipRole = CLINIC_ROLES.SECRETARY;
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/clinical-visits/' + VISIT_ID + '/complete',
        headers: authHeader(),
        payload: {},
      });
      expect(response.statusCode).toBe(403);
    });

    it('returns 422 when the note lacks a reason code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/clinical-visits/' + VISIT_ID + '/complete',
        headers: authHeader(),
        payload: {},
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('CLINICAL_VISIT_INCOMPLETE_NOTE');
    });

    it('returns 409 when the visit is already completed', async () => {
      clinicalVisitRepositoryMock.findByIdInClinic.mockResolvedValue({
        ...clinicalVisitRecord(CLINIC_A),
        status: 'COMPLETED',
        completedAt: new Date(),
      } as never);
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/clinical-visits/' + VISIT_ID + '/complete',
        headers: authHeader(),
        payload: {},
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('CLINICAL_VISIT_ALREADY_COMPLETED');
    });
  });

  describe('GET /patients/:patientId/clinical-visits', () => {
    it('returns 401 unauthenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/patients/' + PATIENT_ID + '/clinical-visits',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when the patient is not in the caller clinic', async () => {
      patientRepositoryMock.findByIdInClinic.mockResolvedValue(null);
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/patients/' + PATIENT_ID + '/clinical-visits',
        headers: authHeader(),
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('PATIENT_NOT_FOUND');
    });

    it('returns paginated visit summaries', async () => {
      clinicalVisitRepositoryMock.listByPatient.mockResolvedValue({
        items: [clinicalVisitRecord(CLINIC_A)],
        total: 1,
      });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/patients/' + PATIENT_ID + '/clinical-visits?page=1&limit=10',
        headers: authHeader(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(1);
      expect(response.json().pagination.total).toBe(1);
    });
  });

  describe('GET /clinical-visits/:visitId', () => {
    it('returns 404 when the visit is not in the caller clinic', async () => {
      clinicalVisitRepositoryMock.findByIdInClinic.mockResolvedValue(null);
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/clinical-visits/' + VISIT_ID,
        headers: authHeader(),
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns the full visit DTO with context', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/clinical-visits/' + VISIT_ID,
        headers: authHeader(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.context.patient).toBeDefined();
      expect(response.json().data.context.appointment).toBeDefined();
    });
  });

  describe('treatment cross-patient isolation', () => {
    it('rejects a treatmentId belonging to a different patient', async () => {
      treatmentRepositoryMock.findByIdInClinic.mockResolvedValue({
        ...treatmentRecord(CLINIC_A, TREATMENT_ID),
        patientId: new Types.ObjectId('652f1c9b8a1e4f0012ab9999'),
      });
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/clinical-visits/' + VISIT_ID,
        headers: authHeader(),
        payload: { treatmentId: TREATMENT_ID },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('CLINICAL_VISIT_TREATMENT_MISMATCH');
    });
  });
});

import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../src/common/constants/error-codes.js';
import type { AuditLogService } from '../../src/modules/audit-logs/audit-log.service.js';
import type { AppointmentRepository } from '../../src/modules/appointments/appointment.repository.js';
import type { AppointmentService } from '../../src/modules/appointments/appointment.service.js';
import { APPOINTMENT_STATUSES, type AppointmentRecord } from '../../src/modules/appointments/appointment.types.js';
import type { ClinicalVisitRepository } from '../../src/modules/clinical-visits/clinical-visit.repository.js';
import { ClinicalVisitService } from '../../src/modules/clinical-visits/clinical-visit.service.js';
import {
  CLINICAL_VISIT_STATUSES,
  type ClinicalVisitRecord,
} from '../../src/modules/clinical-visits/clinical-visit.types.js';
import type { PatientRepository } from '../../src/modules/patients/patient.repository.js';
import type { TreatmentRepository } from '../../src/modules/treatments/treatment.repository.js';
import { TREATMENT_STATUSES, TREATMENT_TYPES } from '../../src/modules/treatments/treatment.types.js';
import type { UserRepository } from '../../src/modules/users/user.repository.js';

const clinicId = new Types.ObjectId().toString();
const patientId = new Types.ObjectId();
const appointmentId = new Types.ObjectId();
const visitId = new Types.ObjectId();
const actorId = new Types.ObjectId().toString();
const now = new Date('2026-08-15T09:00:00.000Z');

const appointment: AppointmentRecord = {
  _id: appointmentId,
  clinicId: new Types.ObjectId(clinicId),
  patientId,
  doctorId: new Types.ObjectId(actorId),
  appointmentTypeId: new Types.ObjectId(),
  startAt: now,
  endAt: new Date('2026-08-15T09:30:00.000Z'),
  durationMinutes: 30,
  status: APPOINTMENT_STATUSES.IN_TREATMENT,
  note: null,
  cancellationReason: null,
  cancelledAt: null,
  cancelledBy: null,
  arrivedAt: now,
  waitingAt: now,
  treatmentStartedAt: now,
  completedAt: null,
  noShowAt: null,
  markedNoShowBy: null,
  overbookingOverride: false,
  overbookingApprovedBy: null,
  createdBy: new Types.ObjectId(actorId),
  updatedBy: null,
  createdAt: now,
  updatedAt: now,
};

const visit: ClinicalVisitRecord = {
  _id: visitId,
  clinicId: new Types.ObjectId(clinicId),
  patientId,
  appointmentId,
  treatmentId: null,
  status: CLINICAL_VISIT_STATUSES.DRAFT,
  reasonCode: null,
  reasonOther: null,
  observations: null,
  procedures: [],
  procedureDetails: null,
  patientInstructions: null,
  doctorNote: null,
  nextVisitRecommendedAt: null,
  nextStepNote: null,
  startedAt: now,
  completedAt: null,
  createdBy: new Types.ObjectId(actorId),
  updatedBy: null,
  createdAt: now,
  updatedAt: now,
};

function fixtures() {
  const visits = {
    findByAppointment: vi.fn().mockResolvedValue(visit),
    findByIdInClinic: vi.fn().mockResolvedValue(visit),
    findPreviousCompleted: vi.fn().mockResolvedValue(null),
    listByPatient: vi.fn().mockResolvedValue({ items: [visit], total: 1 }),
    create: vi.fn().mockResolvedValue(visit),
    update: vi.fn().mockResolvedValue(visit),
    complete: vi.fn().mockResolvedValue({
      ...visit,
      status: CLINICAL_VISIT_STATUSES.COMPLETED,
      completedAt: now,
    }),
  };
  const appointments = { findByIdInClinic: vi.fn().mockResolvedValue(appointment) };
  const appointmentLifecycle = { changeStatus: vi.fn().mockResolvedValue({}) };
  const patients = {
    findByIdInClinic: vi.fn().mockResolvedValue({
      _id: patientId,
      firstName: 'Nadia',
      lastName: 'Ben Ali',
    }),
  };
  const treatments = {
    findActiveForPatient: vi.fn().mockResolvedValue(null),
    findByIdInClinic: vi.fn().mockResolvedValue(null),
  };
  const users = {
    findById: vi.fn().mockResolvedValue(null),
    findManyByIds: vi.fn().mockResolvedValue([]),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new ClinicalVisitService(
    visits as unknown as ClinicalVisitRepository,
    appointments as unknown as AppointmentRepository,
    appointmentLifecycle as unknown as AppointmentService,
    patients as unknown as PatientRepository,
    treatments as unknown as TreatmentRepository,
    users as unknown as UserRepository,
    audit as unknown as AuditLogService,
  );
  return { service, visits, appointments, appointmentLifecycle, patients, treatments, audit };
}

const mutation = { actorUserId: actorId, ip: null, userAgent: null };
const clinical = { ...mutation, canEditCompleted: false, canCompleteAppointment: true };

describe('ClinicalVisitService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the same appointment-linked visit idempotently', async () => {
    const f = fixtures();
    const result = await f.service.ensureForAppointment(clinicId, appointmentId.toString(), mutation);
    expect(result.id).toBe(visitId.toString());
    expect(f.visits.create).not.toHaveBeenCalled();
  });

  it('creates from an in-treatment appointment and preselects active treatment', async () => {
    const f = fixtures();
    const treatmentId = new Types.ObjectId();
    f.visits.findByAppointment.mockResolvedValueOnce(null);
    f.treatments.findActiveForPatient.mockResolvedValueOnce({
      _id: treatmentId,
      patientId,
      status: TREATMENT_STATUSES.ACTIVE,
      type: TREATMENT_TYPES.CLEAR_ALIGNERS,
    });
    await f.service.ensureForAppointment(clinicId, appointmentId.toString(), mutation);
    expect(f.visits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId,
        patientId: patientId.toString(),
        appointmentId: appointmentId.toString(),
        treatmentId: treatmentId.toString(),
      }),
    );
  });

  it('does not create a note before the operational visit starts', async () => {
    const f = fixtures();
    f.visits.findByAppointment.mockResolvedValueOnce(null);
    f.appointments.findByIdInClinic.mockResolvedValueOnce({
      ...appointment,
      status: APPOINTMENT_STATUSES.WAITING,
    });
    await expect(
      f.service.ensureForAppointment(clinicId, appointmentId.toString(), mutation),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLINICAL_VISIT_INVALID_APPOINTMENT_STATE });
  });

  it('rejects a treatment belonging to another patient', async () => {
    const f = fixtures();
    f.treatments.findByIdInClinic.mockResolvedValueOnce({
      _id: new Types.ObjectId(),
      patientId: new Types.ObjectId(),
      status: TREATMENT_STATUSES.ACTIVE,
    });
    await expect(
      f.service.update(
        clinicId,
        visitId.toString(),
        { treatmentId: new Types.ObjectId().toString() },
        clinical,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLINICAL_VISIT_TREATMENT_MISMATCH });
  });

  it('requires a reason and meaningful clinical content before completion', async () => {
    const f = fixtures();
    await expect(f.service.complete(clinicId, visitId.toString(), {}, clinical)).rejects.toMatchObject({
      code: ERROR_CODES.CLINICAL_VISIT_INCOMPLETE_NOTE,
    });
    expect(f.appointmentLifecycle.changeStatus).not.toHaveBeenCalled();
  });

  it('completes the appointment and signed note together without auditing note bodies', async () => {
    const f = fixtures();
    await f.service.complete(
      clinicId,
      visitId.toString(),
      { reasonCode: 'ROUTINE_ADJUSTMENT', observations: 'Alignment improving' },
      clinical,
    );
    expect(f.appointmentLifecycle.changeStatus).toHaveBeenCalledWith(
      clinicId,
      appointmentId.toString(),
      APPOINTMENT_STATUSES.COMPLETED,
      expect.objectContaining({ canCompleteVisit: true }),
      undefined,
    );
    expect(f.visits.complete).toHaveBeenCalled();
    expect(f.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'clinical_visit.completed',
        metadata: expect.not.objectContaining({ observations: expect.anything() }),
      }),
      undefined,
    );
  });

  it('keeps completed notes read-only for non-owners', async () => {
    const f = fixtures();
    f.visits.findByIdInClinic.mockResolvedValueOnce({
      ...visit,
      status: CLINICAL_VISIT_STATUSES.COMPLETED,
      completedAt: now,
    });
    await expect(
      f.service.update(clinicId, visitId.toString(), { doctorNote: 'Correction' }, clinical),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLINICAL_VISIT_ALREADY_COMPLETED });
  });
});

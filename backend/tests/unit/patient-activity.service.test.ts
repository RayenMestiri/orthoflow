import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import type { TenantContext } from '../../src/common/types/auth.types.js';
import { PatientActivityService } from '../../src/modules/patients/patient-activity.service.js';
import type {
  DomainRecordsResult,
  PatientActivityContext,
} from '../../src/modules/patients/patient-activity.repository.js';
import type { AppointmentRecord } from '../../src/modules/appointments/appointment.types.js';
import type { ClinicalVisitRecord } from '../../src/modules/clinical-visits/clinical-visit.types.js';
import type { TreatmentRecord } from '../../src/modules/treatments/treatment.types.js';
import type { CashRecordRecord } from '../../src/modules/cash-records/cash-record.types.js';
import type { PatientMediaRecord } from '../../src/modules/patient-media/patient-media.types.js';

const CLINIC_ID = new Types.ObjectId().toString();
const PATIENT_ID = new Types.ObjectId().toString();
const ACTOR_ID = new Types.ObjectId().toString();
const APPT_ID = new Types.ObjectId().toString();
const VISIT_ID = new Types.ObjectId().toString();
const TREATMENT_ID = new Types.ObjectId().toString();
const CASH_ID = new Types.ObjectId().toString();
const MEDIA_ID = new Types.ObjectId().toString();

function tenant(role: TenantContext['role']): TenantContext {
  return { clinicId: CLINIC_ID, role, isPlatformAdmin: false };
}

function buildMockData(): { records: DomainRecordsResult; context: PatientActivityContext } {
  const appointment: AppointmentRecord = {
    _id: new Types.ObjectId(APPT_ID),
    clinicId: new Types.ObjectId(CLINIC_ID),
    patientId: new Types.ObjectId(PATIENT_ID),
    typeId: new Types.ObjectId(),
    treatmentId: new Types.ObjectId(TREATMENT_ID),
    startAt: new Date('2026-08-20T10:00:00.000Z'),
    durationMinutes: 30,
    status: 'COMPLETED',
    statusHistory: [],
    cancellationReason: null,
    cancelledAt: null,
    noShowAt: null,
    completedAt: new Date('2026-08-20T10:30:00.000Z'),
    treatmentStartedAt: new Date('2026-08-20T10:05:00.000Z'),
    waitingAt: new Date('2026-08-20T09:55:00.000Z'),
    arrivedAt: new Date('2026-08-20T09:50:00.000Z'),
    notes: null,
    createdBy: new Types.ObjectId(ACTOR_ID),
    updatedBy: new Types.ObjectId(ACTOR_ID),
    createdAt: new Date('2026-08-10T08:00:00.000Z'),
    updatedAt: new Date('2026-08-20T10:30:00.000Z'),
  } as never;

  const visit: ClinicalVisitRecord = {
    _id: new Types.ObjectId(VISIT_ID),
    clinicId: new Types.ObjectId(CLINIC_ID),
    patientId: new Types.ObjectId(PATIENT_ID),
    treatmentId: new Types.ObjectId(TREATMENT_ID),
    appointmentId: new Types.ObjectId(APPT_ID),
    status: 'COMPLETED',
    reasonCode: 'ROUTINE_ADJUSTMENT',
    reasonOther: null,
    observations: 'Private doctor notes',
    doctorNote: 'Secret doctor note',
    procedures: ['WIRE_CHANGE', 'ELASTICS_INSTRUCTION'],
    procedureDetails: 'Lower arch wire changed to 0.016 NiTi',
    patientInstructions: 'Wear elastics 24/7',
    nextVisitRecommendedAt: new Date('2026-09-20T09:00:00.000Z'),
    nextStepNote: 'Contrôle et changement de ligatures',
    startedAt: new Date('2026-08-20T10:05:00.000Z'),
    completedAt: new Date('2026-08-20T10:25:00.000Z'),
    createdBy: new Types.ObjectId(ACTOR_ID),
    updatedBy: new Types.ObjectId(ACTOR_ID),
    createdAt: new Date('2026-08-20T10:05:00.000Z'),
    updatedAt: new Date('2026-08-20T10:25:00.000Z'),
  } as never;

  const treatment: TreatmentRecord = {
    _id: new Types.ObjectId(TREATMENT_ID),
    clinicId: new Types.ObjectId(CLINIC_ID),
    patientId: new Types.ObjectId(PATIENT_ID),
    type: 'METAL_BRACES',
    customTypeLabel: null,
    status: 'IN_PROGRESS',
    startedAt: new Date('2026-08-01T09:00:00.000Z'),
    pausedAt: null,
    resumedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdBy: new Types.ObjectId(ACTOR_ID),
    updatedBy: new Types.ObjectId(ACTOR_ID),
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
    updatedAt: new Date('2026-08-01T09:00:00.000Z'),
  } as never;

  const cashRecord: CashRecordRecord = {
    _id: new Types.ObjectId(CASH_ID),
    clinicId: new Types.ObjectId(CLINIC_ID),
    patientId: new Types.ObjectId(PATIENT_ID),
    treatmentId: new Types.ObjectId(TREATMENT_ID),
    receiptId: new Types.ObjectId(),
    amountMinor: 200_000,
    currency: 'TND',
    paymentMethod: 'CASH',
    payer: { fullName: 'Mohamed Salah', relationship: 'FATHER', phone: null, isGuardian: true },
    status: 'RECORDED',
    cancellation: null,
    correction: null,
    receivedAt: new Date('2026-08-15T11:00:00.000Z'),
    recordedBy: new Types.ObjectId(ACTOR_ID),
    createdAt: new Date('2026-08-15T11:00:00.000Z'),
    updatedAt: new Date('2026-08-15T11:00:00.000Z'),
  } as never;

  const media: PatientMediaRecord = {
    _id: new Types.ObjectId(MEDIA_ID),
    clinicId: new Types.ObjectId(CLINIC_ID),
    patientId: new Types.ObjectId(PATIENT_ID),
    treatmentId: new Types.ObjectId(TREATMENT_ID),
    originalName: 'panoramic_xray.png',
    mimeType: 'image/png',
    category: 'XRAY',
    isArchived: false,
    archivedAt: null,
    uploadedBy: new Types.ObjectId(ACTOR_ID),
    createdAt: new Date('2026-08-18T14:00:00.000Z'),
    updatedAt: new Date('2026-08-18T14:00:00.000Z'),
  } as never;

  const records: DomainRecordsResult = {
    appointments: [appointment],
    visits: [visit],
    treatments: [treatment],
    cashRecords: [cashRecord],
    media: [media],
  };

  const context: PatientActivityContext = {
    appointmentTypes: new Map([
      [appointment.typeId!.toString(), { _id: appointment.typeId, name: 'Contrôle régulier', code: 'CTRL' } as never],
    ]),
    treatments: new Map([[TREATMENT_ID, treatment]]),
    receipts: new Map([
      [cashRecord.receiptId!.toString(), { _id: cashRecord.receiptId, receiptNumber: 'REC-2026-000058' } as never],
    ]),
    users: new Map([
      [ACTOR_ID, { _id: new Types.ObjectId(ACTOR_ID), firstName: 'Amine', lastName: 'Ben Salah', email: 'doctor@orthoflow.test' } as never],
    ]),
    memberships: new Map([
      [ACTOR_ID, { userId: new Types.ObjectId(ACTOR_ID), role: CLINIC_ROLES.CLINIC_OWNER } as never],
    ]),
  };

  return { records, context };
}

function buildService(data = buildMockData()) {
  const repository = {
    fetchDomainRecords: vi.fn().mockResolvedValue(data.records),
    loadContext: vi.fn().mockResolvedValue(data.context),
  };
  const patients = {
    findByIdInClinic: vi.fn().mockResolvedValue({ _id: PATIENT_ID }),
  };

  return {
    service: new PatientActivityService(repository as never, patients as never),
    repository,
    patients,
    data,
  };
}

describe('PatientActivityService', () => {
  it('normalizes and orders domain events newest first with stable pagination', async () => {
    const { service } = buildService();

    const result = await service.list(tenant(CLINIC_ROLES.CLINIC_OWNER), PATIENT_ID, 'ALL', {
      page: 1,
      limit: 3,
    });

    expect(result.result.items.length).toBe(3);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(3);

    // Timestamps check: newest first
    const dates = result.result.items.map((i) => new Date(i.occurredAt).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]!);
    }

    // Verify categories are populated
    for (const item of result.result.items) {
      expect(['CLINICAL', 'APPOINTMENT', 'PAYMENT', 'DOCUMENT', 'TREATMENT']).toContain(item.category);
    }
  });

  it('redacts sensitive clinical procedure details for secretary roles', async () => {
    const { service } = buildService();

    // Secretary role (has CLINICAL_VISITS_VIEW but lacks CLINICAL_VISITS_MANAGE)
    const result = await service.list(tenant(CLINIC_ROLES.SECRETARY), PATIENT_ID, 'ALL', {
      page: 1,
      limit: 10,
    });

    const visitItem = result.result.items.find((i) => i.type === 'CLINICAL_VISIT_COMPLETED');
    expect(visitItem).toBeDefined();
    expect(visitItem?.title).toBe('Consultation terminée');
    // Sensitive procedure details are redacted server-side
    expect(visitItem?.detail).toBeNull();
  });

  it('shows structured procedures summary for clinic owner', async () => {
    const { service } = buildService();

    const result = await service.list(tenant(CLINIC_ROLES.CLINIC_OWNER), PATIENT_ID, 'ALL', {
      page: 1,
      limit: 10,
    });

    const visitItem = result.result.items.find((i) => i.type === 'CLINICAL_VISIT_COMPLETED');
    expect(visitItem).toBeDefined();
    expect(visitItem?.detail).toBe("Changement d'arc · Consignes élastiques");
  });

  it('handles payment cancellation and retains both record and cancellation events', async () => {
    const data = buildMockData();
    // Cancel the cash record
    data.records.cashRecords[0]!.status = 'CANCELLED';
    data.records.cashRecords[0]!.cancelledAt = new Date('2026-08-16T10:00:00.000Z');
    data.records.cashRecords[0]!.cancelledBy = new Types.ObjectId(ACTOR_ID);
    data.records.cashRecords[0]!.cancellationReason = 'Montant erroné';

    const { service } = buildService(data);

    const result = await service.list(tenant(CLINIC_ROLES.CLINIC_OWNER), PATIENT_ID, 'PAYMENTS', {
      page: 1,
      limit: 10,
    });

    const types = result.result.items.map((i) => i.type);
    expect(types).toContain('PAYMENT_RECORDED');
    expect(types).toContain('PAYMENT_CANCELLED');

    const cancelledItem = result.result.items.find((i) => i.type === 'PAYMENT_CANCELLED');
    expect(cancelledItem?.cancellationReason).toBe('Montant erroné');
  });

  it('throws NotFoundError if patient does not exist in clinic', async () => {
    const { service, patients } = buildService();
    patients.findByIdInClinic.mockResolvedValue(null);

    await expect(
      service.list(tenant(CLINIC_ROLES.CLINIC_OWNER), PATIENT_ID, 'ALL', { page: 1, limit: 10 }),
    ).rejects.toThrow('Patient not found');
  });
});

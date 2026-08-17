import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import type { TenantContext } from '../../src/common/types/auth.types.js';
import { PatientActivityService } from '../../src/modules/patients/patient-activity.service.js';
import type { PatientActivityContext } from '../../src/modules/patients/patient-activity.repository.js';
import type { AuditLogRecord } from '../../src/modules/audit-logs/audit-log.types.js';

const CLINIC_ID = new Types.ObjectId().toString();
const PATIENT_ID = new Types.ObjectId().toString();
const ACTOR_ID = new Types.ObjectId().toString();
const VISIT_ID = new Types.ObjectId().toString();
const TREATMENT_ID = new Types.ObjectId().toString();
const CASH_ID = new Types.ObjectId().toString();

function tenant(role: TenantContext['role']): TenantContext {
  return { clinicId: CLINIC_ID, role, isPlatformAdmin: false };
}

function audit(
  action: AuditLogRecord['action'],
  resourceType: AuditLogRecord['resourceType'],
  resourceId: string,
  createdAt: string,
  metadata: Record<string, unknown> = {},
): AuditLogRecord {
  return {
    _id: new Types.ObjectId(),
    clinicId: new Types.ObjectId(CLINIC_ID),
    actorUserId: new Types.ObjectId(ACTOR_ID),
    action,
    resourceType,
    resourceId: new Types.ObjectId(resourceId),
    metadata,
    ip: null,
    userAgent: null,
    createdAt: new Date(createdAt),
  };
}

function context(): PatientActivityContext {
  const treatment = {
    _id: new Types.ObjectId(TREATMENT_ID),
    type: 'METAL_BRACES',
    customTypeLabel: null,
  } as never;
  const visit = {
    _id: new Types.ObjectId(VISIT_ID),
    treatmentId: new Types.ObjectId(TREATMENT_ID),
    appointmentId: new Types.ObjectId(),
    reasonCode: 'ROUTINE_ADJUSTMENT',
    procedures: ['WIRE_CHANGE', 'ELASTICS_INSTRUCTION'],
    createdBy: new Types.ObjectId(ACTOR_ID),
    updatedBy: new Types.ObjectId(ACTOR_ID),
    completedAt: new Date('2026-08-15T10:00:00.000Z'),
    updatedAt: new Date('2026-08-15T10:00:00.000Z'),
    nextVisitRecommendedAt: new Date('2026-09-12T09:00:00.000Z'),
  } as never;
  const cash = {
    _id: new Types.ObjectId(CASH_ID),
    treatmentId: new Types.ObjectId(TREATMENT_ID),
    receiptId: new Types.ObjectId(),
    amountMinor: 200_000,
    currency: 'TND',
    cancellationReason: null,
  } as never;
  return {
    appointments: new Map(),
    appointmentTypes: new Map(),
    treatments: new Map([[TREATMENT_ID, treatment]]),
    visits: new Map([[VISIT_ID, visit]]),
    cashRecords: new Map([[CASH_ID, cash]]),
    receipts: new Map([
      [
        CASH_ID,
        { cashRecordId: new Types.ObjectId(CASH_ID), receiptNumber: 'REC-2026-000048' } as never,
      ],
    ]),
    media: new Map(),
    users: new Map([
      [
        ACTOR_ID,
        { _id: new Types.ObjectId(ACTOR_ID), firstName: 'Sarah', lastName: 'Trabelsi' } as never,
      ],
    ]),
    memberships: new Map([
      [ACTOR_ID, { userId: new Types.ObjectId(ACTOR_ID), role: CLINIC_ROLES.SECRETARY } as never],
    ]),
  };
}

function build(audits: AuditLogRecord[], includeFollowUp = false) {
  const resources = context();
  const followUp = resources.visits.get(VISIT_ID);
  if (includeFollowUp && followUp) {
    followUp.completedAt = new Date('2026-08-15T11:00:00.000Z');
  }
  const followUps = includeFollowUp && followUp ? [followUp] : [];
  const repository = {
    listAudits: vi.fn().mockResolvedValue({ items: audits, total: audits.length }),
    listFollowUps: vi.fn().mockResolvedValue({ items: followUps, total: followUps.length }),
    loadContext: vi.fn().mockResolvedValue(resources),
  };
  const patients = { findByIdInClinic: vi.fn().mockResolvedValue({ _id: PATIENT_ID }) };
  return {
    service: new PatientActivityService(repository as never, patients as never),
    repository,
    resources,
  };
}

describe('PatientActivityService', () => {
  it('normalizes and orders domain events newest first with stable pagination', async () => {
    const visitAudit = audit(
      'clinical_visit.completed',
      'clinical_visit',
      VISIT_ID,
      '2026-08-15T10:00:00.000Z',
    );
    const paymentAudit = audit(
      'cash_record.created',
      'cash_record',
      CASH_ID,
      '2026-08-12T09:00:00.000Z',
      { amountMinor: 200_000, currency: 'TND' },
    );
    const { service } = build([paymentAudit, visitAudit], true);

    const result = await service.list(tenant(CLINIC_ROLES.CLINIC_OWNER), PATIENT_ID, 'ALL', {
      page: 1,
      limit: 2,
    });

    expect(result.result.items.map((item) => item.type)).toEqual([
      'FOLLOW_UP_RECOMMENDED',
      'CLINICAL_VISIT_COMPLETED',
    ]);
    expect(result.result.total).toBe(3);

    const secondPage = await service.list(tenant(CLINIC_ROLES.CLINIC_OWNER), PATIENT_ID, 'ALL', {
      page: 2,
      limit: 2,
    });
    expect(secondPage.result.items[0]).toMatchObject({
      type: 'PAYMENT_RECORDED',
      amountMinor: 200_000,
      receiptNumber: 'REC-2026-000048',
    });
  });

  it('redacts structured clinical content for secretary while keeping the safe event', async () => {
    const { service } = build([
      audit('clinical_visit.completed', 'clinical_visit', VISIT_ID, '2026-08-15T10:00:00.000Z'),
    ]);

    const result = await service.list(tenant(CLINIC_ROLES.SECRETARY), PATIENT_ID, 'CLINICAL', {
      page: 1,
      limit: 20,
    });

    expect(result.result.items[0]).toMatchObject({
      title: 'Clinical visit completed',
      subtitle: 'Metal braces',
      detail: null,
      targetType: null,
    });
  });

  it('shows structured clinical context to an owner without exposing note bodies', async () => {
    const { service } = build([
      audit('clinical_visit.completed', 'clinical_visit', VISIT_ID, '2026-08-15T10:00:00.000Z'),
    ]);

    const result = await service.list(tenant(CLINIC_ROLES.CLINIC_OWNER), PATIENT_ID, 'CLINICAL', {
      page: 1,
      limit: 20,
    });

    expect(result.result.items[0]).toMatchObject({
      subtitle: 'Routine adjustment',
      detail: 'Wire change · Elastics instruction',
      targetType: 'CLINICAL_VISIT',
    });
    expect(JSON.stringify(result.result.items[0])).not.toContain('doctorNote');
  });

  it('uses one appointment audit transition as one patient activity event', async () => {
    const appointmentId = new Types.ObjectId().toString();
    const transition = audit(
      'appointment.status_changed',
      'appointment',
      appointmentId,
      '2026-08-15T09:52:00.000Z',
      { from: 'SCHEDULED', to: 'ARRIVED' },
    );
    const built = build([transition]);
    built.resources.appointments.set(appointmentId, {
      _id: new Types.ObjectId(appointmentId),
      appointmentTypeId: new Types.ObjectId(),
      treatmentId: null,
    } as never);

    const result = await built.service.list(
      tenant(CLINIC_ROLES.CLINIC_OWNER),
      PATIENT_ID,
      'APPOINTMENTS',
      { page: 1, limit: 20 },
    );

    expect(result.result.items).toHaveLength(1);
    expect(result.result.items[0]?.type).toBe('PATIENT_ARRIVED');
  });

  it('passes clinic, filter and bounded candidate limit to the repository', async () => {
    const { service, repository } = build([]);

    await service.list(tenant(CLINIC_ROLES.CLINIC_OWNER), PATIENT_ID, 'DOCUMENTS', {
      page: 3,
      limit: 10,
    });

    expect(repository.listAudits).toHaveBeenCalledWith(
      CLINIC_ID,
      PATIENT_ID,
      'DOCUMENTS',
      expect.anything(),
      30,
    );
    expect(repository.loadContext).toHaveBeenCalledWith(CLINIC_ID, PATIENT_ID, [], []);
  });
});

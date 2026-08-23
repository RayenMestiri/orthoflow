import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../src/common/errors/app-error.js';
import { auditLogService } from '../../src/modules/audit-logs/audit-log.service.js';
import { PatientGuardianModel } from '../../src/modules/guardians/patient-guardian.model.js';
import { receiptService } from '../../src/modules/receipts/receipt.service.js';
import {
  PortalReadService,
  toPortalAppointmentStatus,
} from '../../src/modules/portal/portal-read.service.js';
import type { AuthenticatedPortalUser } from '../../src/modules/portal/portal.types.js';

const CLINIC_ID = '652f1c9b8a1e4f0012ab0001';
const GUARDIAN_ID = '652f1c9b8a1e4f0012ab0002';
const PATIENT_ID = '652f1c9b8a1e4f0012ab0003';
const RECEIPT_ID = '652f1c9b8a1e4f0012ab0004';

const user: AuthenticatedPortalUser = {
  id: '652f1c9b8a1e4f0012ab0005',
  sessionId: '652f1c9b8a1e4f0012ab0006',
  clinicId: CLINIC_ID,
  guardianId: GUARDIAN_ID,
  email: 'guardian@example.test',
};

const relation = {
  _id: new Types.ObjectId(),
  clinicId: new Types.ObjectId(CLINIC_ID),
  guardianId: new Types.ObjectId(GUARDIAN_ID),
  patientId: new Types.ObjectId(PATIENT_ID),
  relationship: 'FATHER',
  isPrimary: true,
  financiallyResponsible: true,
};

function findOneResult(value: unknown) {
  return {
    lean: () => ({ exec: async () => value }),
  } as never;
}

describe('PortalReadService security projections', () => {
  afterEach(() => vi.restoreAllMocks());

  it('authorizes a child only through the current clinic-scoped guardian relationship', async () => {
    const findOne = vi
      .spyOn(PatientGuardianModel, 'findOne')
      .mockReturnValue(findOneResult(relation));

    await expect(new PortalReadService().requireChild(user, PATIENT_ID)).resolves.toBe(relation);
    expect(findOne).toHaveBeenCalledWith({
      clinicId: new Types.ObjectId(CLINIC_ID),
      guardianId: new Types.ObjectId(GUARDIAN_ID),
      patientId: new Types.ObjectId(PATIENT_ID),
    });
  });

  it('returns not-found semantics for an unlinked or cross-clinic child', async () => {
    vi.spyOn(PatientGuardianModel, 'findOne').mockReturnValue(findOneResult(null));

    await expect(new PortalReadService().requireChild(user, PATIENT_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('enforces financially-responsible access before reading finance data', async () => {
    const service = new PortalReadService();
    vi.spyOn(service, 'requireChild').mockResolvedValue({
      ...relation,
      financiallyResponsible: false,
    } as never);

    await expect(service.finance(user, PATIENT_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('redacts internal identifiers and staff identity from a portal receipt', async () => {
    const service = new PortalReadService();
    vi.spyOn(service, 'finance').mockResolvedValue({} as never);
    vi.spyOn(receiptService, 'getById').mockResolvedValue({
      id: RECEIPT_ID,
      clinicId: CLINIC_ID,
      patientId: PATIENT_ID,
      treatmentId: '652f1c9b8a1e4f0012ab0007',
      cashRecordId: '652f1c9b8a1e4f0012ab0008',
      issuedByName: 'Internal Staff Member',
      receiptNumber: 'REC-2026-000001',
      amountMinor: 100000,
      amountFormatted: '1,000.000 TND',
      currency: 'TND',
      paymentMethod: 'CASH',
      issuedAt: '2026-08-23T09:00:00.000Z',
      status: 'ISSUED',
      clinicName: 'OrthoFlow Clinic',
      clinicAddress: 'Tunis',
      clinicPhone: '+216 70 000 000',
      patientName: 'Rayen Mestiri',
      treatmentLabel: 'Metal braces',
      payerName: 'Mohamed Mestiri',
      cancellationReason: null,
    });
    vi.spyOn(auditLogService, 'recordSafe').mockResolvedValue(undefined);

    const result = await service.receipt(user, PATIENT_ID, RECEIPT_ID);

    expect(result).toMatchObject({
      receiptNumber: 'REC-2026-000001',
      patientName: 'Rayen Mestiri',
      amountMinor: 100000,
    });
    expect(result).not.toHaveProperty('clinicId');
    expect(result).not.toHaveProperty('patientId');
    expect(result).not.toHaveProperty('cashRecordId');
    expect(result).not.toHaveProperty('issuedByName');
  });

  it('maps internal reception states to a single parent-friendly status', () => {
    expect(toPortalAppointmentStatus('ARRIVED')).toBe('VISIT_IN_PROGRESS');
    expect(toPortalAppointmentStatus('WAITING')).toBe('VISIT_IN_PROGRESS');
    expect(toPortalAppointmentStatus('IN_TREATMENT')).toBe('VISIT_IN_PROGRESS');
    expect(toPortalAppointmentStatus('NO_SHOW')).toBe('MISSED');
    expect(toPortalAppointmentStatus('COMPLETED')).toBe('COMPLETED');
  });
});

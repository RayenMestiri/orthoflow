import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import {
  CASH_RECORD_ID,
  RECEIPT_ID,
  cashRecordRecord,
  cashRecordRepositoryMock,
  financeState,
  receiptRepositoryMock,
  resetFinanceMocks,
  resetFinanceState,
} from '../helpers/finance-mocks.js';
import {
  CLINIC_A,
  CLINIC_B,
  GUARDIAN_ID,
  PATIENT_ID,
  TREATMENT_ID,
  USER_ID,
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
vi.mock('../../src/modules/guardians/guardian.repository.js', async () => ({
  guardianRepository: (await import('../helpers/repository-mocks.js')).guardianRepositoryMock,
}));
vi.mock('../../src/modules/guardians/patient-guardian.repository.js', async () => ({
  patientGuardianRepository: (await import('../helpers/repository-mocks.js'))
    .patientGuardianRepositoryMock,
}));
vi.mock('../../src/modules/treatments/treatment.repository.js', async () => ({
  treatmentRepository: (await import('../helpers/repository-mocks.js')).treatmentRepositoryMock,
}));
vi.mock('../../src/modules/cash-records/cash-record.repository.js', async () => ({
  cashRecordRepository: (await import('../helpers/finance-mocks.js')).cashRecordRepositoryMock,
}));
vi.mock('../../src/modules/receipts/receipt.repository.js', async () => ({
  receiptRepository: (await import('../helpers/finance-mocks.js')).receiptRepositoryMock,
}));
vi.mock('../../src/modules/audit-logs/audit-log.repository.js', async () => ({
  auditLogRepository: (await import('../helpers/repository-mocks.js')).auditLogRepositoryMock,
}));
vi.mock('../../src/modules/notifications/notification.service.js', () => ({
  communicationEventService: { enqueue: vi.fn(async () => undefined) },
}));

const CASH_RECORDS_URL = `/api/v1/patients/${PATIENT_ID}/cash-records`;

function payment(overrides: Record<string, unknown> = {}) {
  return { amount: '200.000', treatmentId: TREATMENT_ID, ...overrides };
}

/**
 * The shared treatment fixture has no agreed price, which is right for the
 * Treatment module's own tests. Money needs one, so it is overridden here
 * rather than in `repository-mocks.ts` — that file belongs to another agent's
 * milestone and this one must not edit it.
 */
beforeEach(() => {
  treatmentRepositoryMock.findByIdInClinic.mockImplementation(
    async (treatmentId: string, clinicId: string) =>
      ({
        ...treatmentRecord(clinicId, treatmentId),
        agreedPrice: financeState.agreedPrice,
      }) as never,
  );
});

/**
 * HTTP-level checks for the money domain: the tenant boundary, the role table,
 * the fields a client must never be able to set, and the validation layer —
 * exercised through the real routing stack.
 */
describe('cash record tenancy', () => {
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
    resetFinanceState();
    resetFinanceMocks();
  });

  it('scopes the payment history to the caller clinic', async () => {
    const response = await app.inject({
      method: 'GET',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(cashRecordRepositoryMock.listByClinic).toHaveBeenCalledWith(
      CLINIC_A,
      expect.objectContaining({ patientId: PATIENT_ID }),
      expect.anything(),
    );
  });

  it('refuses an x-clinic-id header pointing at a clinic the caller is not in', async () => {
    const response = await app.inject({
      method: 'GET',
      url: CASH_RECORDS_URL,
      headers: { ...authHeader(), 'x-clinic-id': CLINIC_B },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('CLINIC_ACCESS_DENIED');
    expect(cashRecordRepositoryMock.listByClinic).not.toHaveBeenCalled();
  });

  it('hides another clinic payment record behind a 404', async () => {
    cashRecordRepositoryMock.findByIdInClinic.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/cash-records/${CASH_RECORD_ID}`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('CASH_RECORD_NOT_FOUND');
  });

  it('returns 404 when the patient belongs to another clinic', async () => {
    patientRepositoryMock.findByIdInClinic.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('PATIENT_NOT_FOUND');
    expect(cashRecordRepositoryMock.create).not.toHaveBeenCalled();
  });
});

describe('cash record forged fields', () => {
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
    resetFinanceState();
    resetFinanceMocks();
  });

  it('ignores clinicId, receivedByUserId, createdBy and status from the body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment({
        clinicId: CLINIC_B,
        receivedByUserId: '652f1c9b8a1e4f0012ab9999',
        createdBy: '652f1c9b8a1e4f0012ab9999',
        status: 'CANCELLED',
        overpaymentOverride: true,
        overpaymentApprovedBy: '652f1c9b8a1e4f0012ab9999',
        receiptNumber: 'REC-2026-000001',
      }),
    });

    expect(response.statusCode).toBe(201);
    // Every server-owned field comes from the session, not the payload.
    expect(cashRecordRepositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC_A,
        receivedByUserId: USER_ID,
        createdBy: USER_ID,
        overpaymentOverride: false,
        overpaymentApprovedBy: null,
      }),
      undefined,
    );
  });

  it('ignores an amount supplied in minor units to bypass parsing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment({ amount: '200.000', amountMinor: 1 }),
    });

    expect(response.statusCode).toBe(201);
    expect(cashRecordRepositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 200_000, currency: 'TND' }),
      undefined,
    );
  });
});

describe('cash record authorization', () => {
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
    resetFinanceState();
    resetFinanceMocks();
  });

  it('lets a secretary record a payment — the front desk takes the money', async () => {
    testState.membershipRole = CLINIC_ROLES.SECRETARY;

    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment(),
    });

    expect(response.statusCode).toBe(201);
    expect(cashRecordRepositoryMock.create).toHaveBeenCalled();
  });

  it('stops a secretary from cancelling a record', async () => {
    testState.membershipRole = CLINIC_ROLES.SECRETARY;

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cash-records/${CASH_RECORD_ID}/cancel`,
      headers: authHeader(),
      payload: { reason: 'Incorrect amount' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(cashRecordRepositoryMock.cancel).not.toHaveBeenCalled();
  });

  it('stops an assistant from reading financial records at all', async () => {
    testState.membershipRole = CLINIC_ROLES.ASSISTANT;

    const response = await app.inject({
      method: 'GET',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(403);
    expect(cashRecordRepositoryMock.listByClinic).not.toHaveBeenCalled();
  });

  it('lets the owner cancel a record with a reason', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cash-records/${CASH_RECORD_ID}/cancel`,
      headers: authHeader(),
      payload: { reason: 'Incorrect amount' },
    });

    expect(response.statusCode).toBe(200);
    expect(cashRecordRepositoryMock.cancel).toHaveBeenCalledWith(
      CASH_RECORD_ID,
      CLINIC_A,
      expect.objectContaining({ cancellationReason: 'Incorrect amount', cancelledBy: USER_ID }),
      undefined,
    );
  });

  it('exposes no delete route for a financial record', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/cash-records/${CASH_RECORD_ID}`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('cash record validation', () => {
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
    resetFinanceState();
    resetFinanceMocks();
  });

  it('rejects a zero amount before any repository is touched', async () => {
    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment({ amount: '0' }),
    });

    expect(response.statusCode).toBe(400);
    expect(cashRecordRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('rejects a negative amount', async () => {
    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment({ amount: '-200.000' }),
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects more decimals than the dinar has', async () => {
    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment({ amount: '200.0001' }),
    });

    expect(response.statusCode).toBe(400);
  });

  it('demands a guardian id when the payer is a guardian', async () => {
    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment({ payerType: 'GUARDIAN' }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a guardian who is linked to the patient', async () => {
    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment({ payerType: 'GUARDIAN', guardianId: GUARDIAN_ID }),
    });

    expect(response.statusCode).toBe(201);
  });

  it('demands a reason to cancel', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cash-records/${CASH_RECORD_ID}/cancel`,
      headers: authHeader(),
      payload: { reason: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(cashRecordRepositoryMock.cancel).not.toHaveBeenCalled();
  });

  it('rejects a malformed cash record id in the URL', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cash-records/not-an-object-id',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(400);
  });

  it('refuses to cancel a record that is already cancelled', async () => {
    financeState.storedStatus = 'CANCELLED';

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cash-records/${CASH_RECORD_ID}/cancel`,
      headers: authHeader(),
      payload: { reason: 'Incorrect amount' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('CASH_RECORD_ALREADY_CANCELLED');
  });
});

describe('idempotency and overpayment over HTTP', () => {
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
    resetFinanceState();
    resetFinanceMocks();
  });

  it('returns the original record instead of creating a second one', async () => {
    financeState.idempotentMatch = cashRecordRecord(CLINIC_A);

    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment({ idempotencyKey: 'submit-abc-1234' }),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.id).toBe(CASH_RECORD_ID);
    expect(cashRecordRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed idempotency key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment({ idempotencyKey: 'short' }),
    });

    expect(response.statusCode).toBe(400);
  });

  it('warns rather than failing when the payment exceeds the balance', async () => {
    // Agreed 3,600.000 with 3,500.000 recorded leaves 100.000 remaining.
    financeState.recordedMinor = 3_500_000;

    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment({ amount: '200.000' }),
    });

    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body.error.code).toBe('PAYMENT_EXCEEDS_REMAINING_AMOUNT');
    expect(body.error.details).toMatchObject({
      requiresConfirmation: true,
      remainingAmountMinor: 100_000,
      excessAmountMinor: 100_000,
      overrideAllowed: true,
    });
    expect(cashRecordRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('records it once the owner confirms explicitly', async () => {
    financeState.recordedMinor = 3_500_000;

    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment({ amount: '200.000', allowOverpayment: true }),
    });

    expect(response.statusCode).toBe(201);
    expect(cashRecordRepositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ overpaymentOverride: true, overpaymentApprovedBy: USER_ID }),
      undefined,
    );
  });

  it('refuses the override from a secretary', async () => {
    testState.membershipRole = CLINIC_ROLES.SECRETARY;
    financeState.recordedMinor = 3_500_000;

    const response = await app.inject({
      method: 'POST',
      url: CASH_RECORDS_URL,
      headers: authHeader(),
      payload: payment({ amount: '200.000', allowOverpayment: true }),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('OVERPAYMENT_APPROVAL_NOT_ALLOWED');
  });
});

describe('financial summary and receipts', () => {
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
    resetFinanceState();
    resetFinanceMocks();
  });

  it('derives agreed, recorded and remaining for a treatment', async () => {
    financeState.recordedMinor = 1_450_000;

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/treatments/${TREATMENT_ID}/financial-summary`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      currency: 'TND',
      agreedAmountMinor: 3_600_000,
      recordedAmountMinor: 1_450_000,
      remainingAmountMinor: 2_150_000,
    });
  });

  it('reports no agreed amount at patient level rather than a misleading zero', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/patients/${PATIENT_ID}/financial-summary`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      agreedAmountMinor: null,
      remainingAmountMinor: null,
    });
  });

  it('returns 404 for a treatment in another clinic', async () => {
    treatmentRepositoryMock.findByIdInClinic.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/treatments/${TREATMENT_ID}/financial-summary`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('TREATMENT_NOT_FOUND');
  });

  it('returns the printable receipt for a payment record', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/cash-records/${CASH_RECORD_ID}/receipt`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      receiptNumber: 'REC-2026-000042',
      amountFormatted: '200.000',
      currency: 'TND',
      clinicName: 'Cabinet Al Amal',
      status: 'ISSUED',
    });
  });

  it('returns 404 when the receipt belongs to another clinic', async () => {
    receiptRepositoryMock.findByIdInClinic.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/receipts/${RECEIPT_ID}`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('RECEIPT_NOT_FOUND');
  });

  it('exposes no route to mint a receipt without a payment', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/receipts',
      headers: authHeader(),
      payload: { amount: '999.000' },
    });

    expect(response.statusCode).toBe(404);
  });
});

import { Types } from 'mongoose';
import { vi } from 'vitest';
import {
  CASH_RECORD_STATUSES,
  PAYER_TYPES,
  PAYMENT_METHODS,
  type CashRecordRecord,
  type CashRecordStatus,
} from '../../src/modules/cash-records/cash-record.types.js';
import { RECEIPT_STATUSES, type ReceiptRecord } from '../../src/modules/receipts/receipt.types.js';
import { PATIENT_ID, TREATMENT_ID, USER_ID } from './repository-mocks.js';

/**
 * In-memory stand-ins for the cash-record and receipt repositories.
 *
 * Kept in their own file rather than appended to `repository-mocks.ts` so the
 * Cash Records milestone adds no edit to a shared test helper another agent may
 * be working in. Same hard rule applies here: this module must never import
 * `src/app.ts`, because `vi.mock` factories import it and the cycle deadlocks
 * the run.
 */

const FIXED_DATE = new Date('2026-08-09T09:42:00.000Z');

export const CASH_RECORD_ID = '652f1c9b8a1e4f0012ac0001';
export const RECEIPT_ID = '652f1c9b8a1e4f0012ac0002';
export const OTHER_PATIENT_ID = '652f1c9b8a1e4f0012ac0003';

/** Knobs an integration test turns to describe the stored financial state. */
interface FinanceState {
  /** Set to a record to make the idempotency lookup hit. */
  idempotentMatch: CashRecordRecord | null;
  /** Status of the record `findByIdInClinic` returns. */
  storedStatus: CashRecordStatus;
  /** Millimes already recorded against the treatment. */
  recordedMinor: number;
  /** Major-unit agreed price on the treatment, or null. */
  agreedPrice: number | null;
}

export const financeState: FinanceState = {
  idempotentMatch: null,
  storedStatus: CASH_RECORD_STATUSES.RECORDED,
  recordedMinor: 0,
  agreedPrice: 3600,
};

export function resetFinanceState(): void {
  financeState.idempotentMatch = null;
  financeState.storedStatus = CASH_RECORD_STATUSES.RECORDED;
  financeState.recordedMinor = 0;
  financeState.agreedPrice = 3600;
}

export function cashRecordRecord(
  clinicId: string,
  cashRecordId = CASH_RECORD_ID,
): CashRecordRecord {
  return {
    _id: new Types.ObjectId(cashRecordId),
    clinicId: new Types.ObjectId(clinicId),
    patientId: new Types.ObjectId(PATIENT_ID),
    treatmentId: new Types.ObjectId(TREATMENT_ID),
    payerType: PAYER_TYPES.SELF,
    guardianId: null,
    payerLabel: null,
    amountMinor: 200_000,
    currency: 'TND',
    paymentMethod: PAYMENT_METHODS.CASH,
    receivedAt: FIXED_DATE,
    receivedByUserId: new Types.ObjectId(USER_ID),
    purpose: null,
    note: null,
    status: financeState.storedStatus,
    receiptId: new Types.ObjectId(RECEIPT_ID),
    overpaymentOverride: false,
    overpaymentApprovedBy: null,
    idempotencyKey: null,
    createdBy: new Types.ObjectId(USER_ID),
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    correctedByRecordId: null,
    correctionOfRecordId: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
}

export function receiptRecordFixture(clinicId: string, receiptId = RECEIPT_ID): ReceiptRecord {
  return {
    _id: new Types.ObjectId(receiptId),
    clinicId: new Types.ObjectId(clinicId),
    patientId: new Types.ObjectId(PATIENT_ID),
    treatmentId: new Types.ObjectId(TREATMENT_ID),
    cashRecordId: new Types.ObjectId(CASH_RECORD_ID),
    receiptNumber: 'REC-2026-000042',
    amountMinor: 200_000,
    currency: 'TND',
    paymentMethod: PAYMENT_METHODS.CASH,
    issuedAt: FIXED_DATE,
    issuedBy: new Types.ObjectId(USER_ID),
    status: RECEIPT_STATUSES.ISSUED,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
}

export const cashRecordRepositoryMock = {
  findByIdInClinic: vi.fn(async (cashRecordId: string, clinicId: string) =>
    cashRecordRecord(clinicId, cashRecordId),
  ),
  findByIdempotencyKey: vi.fn(async () => financeState.idempotentMatch),
  listByClinic: vi.fn(async (clinicId: string) => ({
    items: [cashRecordRecord(clinicId)],
    total: 1,
  })),
  sumRecordedMinor: vi.fn(async () => ({
    totalMinor: financeState.recordedMinor,
    recordCount: financeState.recordedMinor === 0 ? 0 : 1,
  })),
  countByStatus: vi.fn(async () => 0),
  create: vi.fn(async (input: { clinicId: string }) => cashRecordRecord(input.clinicId)),
  attachReceipt: vi.fn(async (cashRecordId: string, clinicId: string) =>
    cashRecordRecord(clinicId, cashRecordId),
  ),
  cancel: vi.fn(async (cashRecordId: string, clinicId: string) => ({
    ...cashRecordRecord(clinicId, cashRecordId),
    status: CASH_RECORD_STATUSES.CANCELLED,
    cancelledAt: FIXED_DATE,
    cancelledBy: new Types.ObjectId(USER_ID),
    cancellationReason: 'Incorrect amount',
  })),
  linkCorrection: vi.fn(async () => undefined),
};

export const receiptRepositoryMock = {
  reserveReceiptNumber: vi.fn(async () => 'REC-2026-000042'),
  create: vi.fn(async (input: { clinicId: string }) => receiptRecordFixture(input.clinicId)),
  findByIdInClinic: vi.fn(async (receiptId: string, clinicId: string) =>
    receiptRecordFixture(clinicId, receiptId),
  ),
  findByCashRecord: vi.fn(async (_cashRecordId: string, clinicId: string) =>
    receiptRecordFixture(clinicId),
  ),
  findManyByCashRecordIds: vi.fn(async (_ids: string[], clinicId: string) => [
    receiptRecordFixture(clinicId),
  ]),
  markCancelled: vi.fn(async (receiptId: string, clinicId: string) => ({
    ...receiptRecordFixture(clinicId, receiptId),
    status: RECEIPT_STATUSES.CANCELLED,
  })),
};

export function resetFinanceMocks(): void {
  for (const repository of [cashRecordRepositoryMock, receiptRepositoryMock]) {
    for (const value of Object.values(repository)) {
      if (typeof value === 'function' && 'mockClear' in value) {
        (value as { mockClear: () => void }).mockClear();
      }
    }
  }
}

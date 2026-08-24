import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/common/constants/error-codes.js';
import { AppError } from '../../src/common/errors/app-error.js';
import { formatMinor } from '../../src/common/utils/money.js';
import type { AuditLogService } from '../../src/modules/audit-logs/audit-log.service.js';
import type { ClinicRepository } from '../../src/modules/clinics/clinic.repository.js';
import type { GuardianRepository } from '../../src/modules/guardians/guardian.repository.js';
import type { PatientGuardianRepository } from '../../src/modules/guardians/patient-guardian.repository.js';
import type { PatientRepository } from '../../src/modules/patients/patient.repository.js';
import type { TreatmentRepository } from '../../src/modules/treatments/treatment.repository.js';
import type { UserRepository } from '../../src/modules/users/user.repository.js';
import type { ReceiptRepository } from '../../src/modules/receipts/receipt.repository.js';
import { ReceiptService } from '../../src/modules/receipts/receipt.service.js';
import type { CashRecordRepository } from '../../src/modules/cash-records/cash-record.repository.js';
import {
  CashRecordService,
  type FinancialActorContext,
  type RecordPaymentInput,
} from '../../src/modules/cash-records/cash-record.service.js';
import { FinancialSummaryService } from '../../src/modules/cash-records/financial-summary.service.js';
import {
  CASH_RECORD_STATUSES,
  PAYER_TYPES,
  PAYMENT_METHODS,
  type CancelCashRecordFields,
  type CashRecordListFilters,
  type CashRecordRecord,
  type CashRecordStatus,
  type CreateCashRecordInput,
} from '../../src/modules/cash-records/cash-record.types.js';
import {
  RECEIPT_STATUSES,
  formatReceiptNumber,
  type CreateReceiptInput,
  type ReceiptRecord,
} from '../../src/modules/receipts/receipt.types.js';

const CLINIC_A = '652f1c9b8a1e4f0012ab34cd';
const CLINIC_B = '652f1c9b8a1e4f0012ab99ff';
const OWNER_ID = '652f1c9b8a1e4f0012ab0001';
const SECRETARY_ID = '652f1c9b8a1e4f0012ab0002';
const PATIENT_ID = '652f1c9b8a1e4f0012abaaaa';
const OTHER_PATIENT_ID = '652f1c9b8a1e4f0012abbbbb';
const TREATMENT_ID = '652f1c9b8a1e4f0012abcccc';
const OTHER_TREATMENT_ID = '652f1c9b8a1e4f0012abcccd';
const GUARDIAN_ID = '652f1c9b8a1e4f0012abdddd';
const UNLINKED_GUARDIAN_ID = '652f1c9b8a1e4f0012abddde';

/** Ahmed Ben Salah's metal braces, agreed at 3,600.000 TND. */
const AGREED_PRICE = 3600;

const OWNER: FinancialActorContext = {
  actorUserId: OWNER_ID,
  ip: null,
  userAgent: null,
  canApproveOverpayment: true,
};

/** The front desk records money but may not waive a balance. */
const SECRETARY: FinancialActorContext = {
  actorUserId: SECRETARY_ID,
  ip: null,
  userAgent: null,
  canApproveOverpayment: false,
};

async function expectRejection(promise: Promise<unknown>, code: string): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error, `expected a rejection with code ${code}`).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

/** In-memory cash records, tenant filter and all. */
class FakeCashRecordRepository {
  records: CashRecordRecord[] = [];

  private inClinic(clinicId: string): CashRecordRecord[] {
    return this.records.filter((record) => record.clinicId.toString() === clinicId);
  }

  async findByIdInClinic(cashRecordId: string, clinicId: string): Promise<CashRecordRecord | null> {
    return this.inClinic(clinicId).find((record) => record._id.toString() === cashRecordId) ?? null;
  }

  async findByIdempotencyKey(key: string, clinicId: string): Promise<CashRecordRecord | null> {
    return this.inClinic(clinicId).find((record) => record.idempotencyKey === key) ?? null;
  }

  private matches(record: CashRecordRecord, filters: CashRecordListFilters): boolean {
    if (filters.patientId && record.patientId.toString() !== filters.patientId) return false;
    if (filters.treatmentId && record.treatmentId?.toString() !== filters.treatmentId) return false;
    if (filters.status && record.status !== filters.status) return false;
    return true;
  }

  async listByClinic(
    clinicId: string,
    filters: CashRecordListFilters,
    pagination: { skip: number; limit: number },
  ) {
    const items = this.inClinic(clinicId)
      .filter((record) => this.matches(record, filters))
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
    return {
      items: items.slice(pagination.skip, pagination.skip + pagination.limit),
      total: items.length,
    };
  }

  async sumRecordedMinor(clinicId: string, filters: { patientId: string; treatmentId?: string }) {
    const items = this.inClinic(clinicId).filter((record) =>
      this.matches(record, { ...filters, status: CASH_RECORD_STATUSES.RECORDED }),
    );
    return {
      totalMinor: items.reduce((sum, record) => sum + record.amountMinor, 0),
      recordCount: items.length,
    };
  }

  async countByStatus(
    clinicId: string,
    filters: { patientId: string; treatmentId?: string },
    status: CashRecordStatus,
  ): Promise<number> {
    return this.inClinic(clinicId).filter((record) => this.matches(record, { ...filters, status }))
      .length;
  }

  async create(input: CreateCashRecordInput): Promise<CashRecordRecord> {
    // Mirrors the unique partial index on (clinicId, idempotencyKey).
    if (
      input.idempotencyKey &&
      this.records.some(
        (record) =>
          record.clinicId.toString() === input.clinicId &&
          record.idempotencyKey === input.idempotencyKey,
      )
    ) {
      throw new Error('E11000 duplicate key error: clinic_idempotency_key_unique');
    }

    const now = new Date();
    const record: CashRecordRecord = {
      _id: new Types.ObjectId(),
      clinicId: new Types.ObjectId(input.clinicId),
      patientId: new Types.ObjectId(input.patientId),
      treatmentId: input.treatmentId ? new Types.ObjectId(input.treatmentId) : null,
      payerType: input.payerType,
      guardianId: input.guardianId ? new Types.ObjectId(input.guardianId) : null,
      payerLabel: input.payerLabel ?? null,
      amountMinor: input.amountMinor,
      currency: input.currency,
      paymentMethod: input.paymentMethod,
      receivedAt: input.receivedAt,
      receivedByUserId: new Types.ObjectId(input.receivedByUserId),
      purpose: input.purpose ?? null,
      note: input.note ?? null,
      status: CASH_RECORD_STATUSES.RECORDED,
      receiptId: null,
      overpaymentOverride: input.overpaymentOverride ?? false,
      overpaymentApprovedBy: input.overpaymentApprovedBy
        ? new Types.ObjectId(input.overpaymentApprovedBy)
        : null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdBy: new Types.ObjectId(input.createdBy),
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      correctedByRecordId: null,
      correctionOfRecordId: input.correctionOfRecordId
        ? new Types.ObjectId(input.correctionOfRecordId)
        : null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.push(record);
    return record;
  }

  async attachReceipt(cashRecordId: string, clinicId: string, receiptId: string) {
    const record = await this.findByIdInClinic(cashRecordId, clinicId);
    if (!record) return null;
    record.receiptId = new Types.ObjectId(receiptId);
    return record;
  }

  /** `status: RECORDED` is part of the match, exactly as it is in Mongo. */
  async cancel(cashRecordId: string, clinicId: string, changes: CancelCashRecordFields) {
    const record = await this.findByIdInClinic(cashRecordId, clinicId);
    if (!record || record.status !== CASH_RECORD_STATUSES.RECORDED) return null;
    record.status = CASH_RECORD_STATUSES.CANCELLED;
    record.cancelledAt = new Date();
    record.cancelledBy = new Types.ObjectId(changes.cancelledBy);
    record.cancellationReason = changes.cancellationReason;
    return record;
  }

  async linkCorrection(originalRecordId: string, clinicId: string, correctionRecordId: string) {
    const record = await this.findByIdInClinic(originalRecordId, clinicId);
    if (record) record.correctedByRecordId = new Types.ObjectId(correctionRecordId);
  }
}

/** In-memory receipts, including the atomic per-clinic-per-year sequence. */
class FakeReceiptRepository {
  receipts: ReceiptRecord[] = [];
  private sequences = new Map<string, number>();

  async reserveReceiptNumber(clinicId: string, year: number): Promise<string> {
    const key = `${clinicId}:${year}`;
    const next = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, next);
    return formatReceiptNumber(year, next);
  }

  async create(input: CreateReceiptInput): Promise<ReceiptRecord> {
    // Mirrors the unique index on (clinicId, receiptNumber).
    if (
      this.receipts.some(
        (receipt) =>
          receipt.clinicId.toString() === input.clinicId &&
          receipt.receiptNumber === input.receiptNumber,
      )
    ) {
      throw new Error('E11000 duplicate key error: receiptNumber');
    }

    const now = new Date();
    const receipt: ReceiptRecord = {
      _id: new Types.ObjectId(),
      clinicId: new Types.ObjectId(input.clinicId),
      patientId: new Types.ObjectId(input.patientId),
      treatmentId: input.treatmentId ? new Types.ObjectId(input.treatmentId) : null,
      cashRecordId: new Types.ObjectId(input.cashRecordId),
      receiptNumber: input.receiptNumber,
      amountMinor: input.amountMinor,
      currency: input.currency,
      paymentMethod: input.paymentMethod,
      issuedAt: input.issuedAt,
      issuedBy: new Types.ObjectId(input.issuedBy),
      status: RECEIPT_STATUSES.ISSUED,
      createdAt: now,
      updatedAt: now,
    };
    this.receipts.push(receipt);
    return receipt;
  }

  async findByIdInClinic(receiptId: string, clinicId: string): Promise<ReceiptRecord | null> {
    return (
      this.receipts.find(
        (receipt) =>
          receipt._id.toString() === receiptId && receipt.clinicId.toString() === clinicId,
      ) ?? null
    );
  }

  async findByCashRecord(cashRecordId: string, clinicId: string): Promise<ReceiptRecord | null> {
    return (
      this.receipts.find(
        (receipt) =>
          receipt.cashRecordId.toString() === cashRecordId &&
          receipt.clinicId.toString() === clinicId,
      ) ?? null
    );
  }

  async findManyByCashRecordIds(ids: string[], clinicId: string): Promise<ReceiptRecord[]> {
    return this.receipts.filter(
      (receipt) =>
        receipt.clinicId.toString() === clinicId && ids.includes(receipt.cashRecordId.toString()),
    );
  }

  async markCancelled(receiptId: string, clinicId: string): Promise<ReceiptRecord | null> {
    const receipt = await this.findByIdInClinic(receiptId, clinicId);
    if (!receipt || receipt.status !== RECEIPT_STATUSES.ISSUED) return null;
    receipt.status = RECEIPT_STATUSES.CANCELLED;
    return receipt;
  }
}

class FakeTreatmentRepository {
  treatments = new Map<
    string,
    { clinicId: string; patientId: string; agreedPrice: number | null; status?: string }
  >();

  async findByIdInClinic(treatmentId: string, clinicId: string) {
    const treatment = this.treatments.get(treatmentId);
    if (!treatment || treatment.clinicId !== clinicId) return null;
    return {
      _id: new Types.ObjectId(treatmentId),
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(treatment.patientId),
      agreedPrice: treatment.agreedPrice,
      status: treatment.status ?? 'ACTIVE',
      type: 'METAL_BRACES' as const,
      customTypeLabel: null,
    };
  }
}

class FakePatientRepository {
  patients = new Map<string, string>([
    [PATIENT_ID, CLINIC_A],
    [OTHER_PATIENT_ID, CLINIC_A],
  ]);

  async findByIdInClinic(patientId: string, clinicId: string) {
    if (this.patients.get(patientId) !== clinicId) return null;
    return {
      _id: new Types.ObjectId(patientId),
      clinicId: new Types.ObjectId(clinicId),
      firstName: 'Ahmed',
      lastName: 'Ben Salah',
    };
  }
}

class FakeGuardianRepository {
  guardians = new Map<string, string>([
    [GUARDIAN_ID, CLINIC_A],
    [UNLINKED_GUARDIAN_ID, CLINIC_A],
  ]);

  async findManyByIdsInClinic(guardianIds: string[], clinicId: string) {
    return guardianIds
      .filter((id) => this.guardians.get(id) === clinicId)
      .map((id) => ({
        _id: new Types.ObjectId(id),
        clinicId: new Types.ObjectId(clinicId),
        firstName: 'Fatma',
        lastName: 'Ben Salah',
      }));
  }
}

class FakePatientGuardianRepository {
  links = new Set<string>([`${PATIENT_ID}:${GUARDIAN_ID}`]);

  async findByPatientAndGuardian(patientId: string, guardianId: string, clinicId: string) {
    if (!this.links.has(`${patientId}:${guardianId}`)) return null;
    return {
      _id: new Types.ObjectId(),
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(patientId),
      guardianId: new Types.ObjectId(guardianId),
    };
  }
}

class FakeUserRepository {
  async findById(userId: string) {
    return {
      _id: new Types.ObjectId(userId),
      firstName: userId === OWNER_ID ? 'Nadia' : 'Sarah',
      lastName: userId === OWNER_ID ? 'Khelifi' : 'Gharbi',
    };
  }

  async findManyByIds(userIds: string[]) {
    return Promise.all(userIds.map((id) => this.findById(id)));
  }
}

class FakeClinicRepository {
  async findById(clinicId: string) {
    return {
      _id: new Types.ObjectId(clinicId),
      name: 'Cabinet Al Amal',
      currency: 'TND',
      phone: '+216 71 000 000',
      address: { line1: '12 Avenue Habib Bourguiba', city: 'Tunis', country: 'TN' },
    };
  }
}

class FakeAuditLogService {
  events: { action: string; metadata?: Record<string, unknown> }[] = [];

  async record(input: { action: string; metadata?: Record<string, unknown> }): Promise<void> {
    this.events.push(input);
  }
}

describe('CashRecordService', () => {
  let cashRecords: FakeCashRecordRepository;
  let receiptRecords: FakeReceiptRepository;
  let treatments: FakeTreatmentRepository;
  let patients: FakePatientRepository;
  let guardians: FakeGuardianRepository;
  let patientGuardians: FakePatientGuardianRepository;
  let users: FakeUserRepository;
  let clinics: FakeClinicRepository;
  let audit: FakeAuditLogService;
  let summaries: FinancialSummaryService;
  let service: CashRecordService;

  beforeEach(() => {
    cashRecords = new FakeCashRecordRepository();
    receiptRecords = new FakeReceiptRepository();
    treatments = new FakeTreatmentRepository();
    patients = new FakePatientRepository();
    guardians = new FakeGuardianRepository();
    patientGuardians = new FakePatientGuardianRepository();
    users = new FakeUserRepository();
    clinics = new FakeClinicRepository();
    audit = new FakeAuditLogService();

    treatments.treatments.set(TREATMENT_ID, {
      clinicId: CLINIC_A,
      patientId: PATIENT_ID,
      agreedPrice: AGREED_PRICE,
    });
    treatments.treatments.set(OTHER_TREATMENT_ID, {
      clinicId: CLINIC_A,
      patientId: OTHER_PATIENT_ID,
      agreedPrice: 1000,
    });

    summaries = new FinancialSummaryService(
      cashRecords as unknown as CashRecordRepository,
      treatments as unknown as TreatmentRepository,
      patients as unknown as PatientRepository,
      clinics as unknown as ClinicRepository,
    );

    const receipts = new ReceiptService(
      receiptRecords as unknown as ReceiptRepository,
      cashRecords as unknown as CashRecordRepository,
      users as unknown as UserRepository,
      patients as unknown as PatientRepository,
      guardians as unknown as GuardianRepository,
      patientGuardians as unknown as PatientGuardianRepository,
      treatments as unknown as TreatmentRepository,
      clinics as unknown as ClinicRepository,
    );

    service = new CashRecordService(
      cashRecords as unknown as CashRecordRepository,
      receipts,
      receiptRecords as unknown as ReceiptRepository,
      summaries,
      patients as unknown as PatientRepository,
      treatments as unknown as TreatmentRepository,
      guardians as unknown as GuardianRepository,
      patientGuardians as unknown as PatientGuardianRepository,
      users as unknown as UserRepository,
      audit as unknown as AuditLogService,
      { enqueue: async () => undefined } as never,
    );
  });

  function payment(overrides: Partial<RecordPaymentInput> = {}): RecordPaymentInput {
    return {
      patientId: PATIENT_ID,
      treatmentId: TREATMENT_ID,
      payerType: PAYER_TYPES.SELF,
      amount: '500.000',
      paymentMethod: PAYMENT_METHODS.CASH,
      ...overrides,
    };
  }

  describe('recording a payment', () => {
    it('stores the amount in minor units and issues a receipt', async () => {
      const record = await service.record(CLINIC_A, payment(), SECRETARY);

      expect(record.amountMinor).toBe(500_000);
      expect(record.amountFormatted).toBe('500.000');
      expect(record.currency).toBe('TND');
      expect(record.status).toBe(CASH_RECORD_STATUSES.RECORDED);
      expect(record.receiptNumber).toMatch(/^REC-\d{4}-\d{6}$/);
      expect(receiptRecords.receipts).toHaveLength(1);
      expect(receiptRecords.receipts[0]?.amountMinor).toBe(500_000);
    });

    it('takes the payment method default and the clinic currency, not the client', async () => {
      const record = await service.record(CLINIC_A, payment(), SECRETARY);
      expect(record.paymentMethod).toBe(PAYMENT_METHODS.CASH);
      expect(record.currency).toBe('TND');
    });

    it('records who received the money from the session, never from the payload', async () => {
      const record = await service.record(CLINIC_A, payment(), SECRETARY);

      expect(record.receivedByUserId).toBe(SECRETARY_ID);
      expect(record.receivedByName).toBe('Sarah Gharbi');
      // Even a forged field cannot win: the input type has no such property and
      // the service only ever reads `context.actorUserId`.
      const forged = await service.record(
        CLINIC_A,
        { ...payment(), receivedByUserId: OWNER_ID } as RecordPaymentInput,
        SECRETARY,
      );
      expect(forged.receivedByUserId).toBe(SECRETARY_ID);
    });

    it('defaults receivedAt to now', async () => {
      const before = Date.now();
      const record = await service.record(CLINIC_A, payment(), SECRETARY);
      expect(new Date(record.receivedAt).getTime()).toBeGreaterThanOrEqual(before);
    });

    it('rejects a zero or negative amount', async () => {
      await expectRejection(
        service.record(CLINIC_A, payment({ amount: '0' }), SECRETARY),
        ERROR_CODES.INVALID_AMOUNT,
      );
      await expectRejection(
        service.record(CLINIC_A, payment({ amount: '-100' }), SECRETARY),
        ERROR_CODES.INVALID_AMOUNT,
      );
      expect(cashRecords.records).toHaveLength(0);
    });

    it('refuses a payment dated in the future', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await expectRejection(
        service.record(CLINIC_A, payment({ receivedAt: tomorrow }), SECRETARY),
        ERROR_CODES.INVALID_RECEIVED_AT,
      );
    });

    it('refuses a payment backdated beyond the allowed window', async () => {
      const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      await expectRejection(
        service.record(CLINIC_A, payment({ receivedAt: longAgo }), SECRETARY),
        ERROR_CODES.INVALID_RECEIVED_AT,
      );
    });

    it('allows a reasonable backdate, which is a real front-desk workflow', async () => {
      const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const record = await service.record(CLINIC_A, payment({ receivedAt: lastWeek }), SECRETARY);
      expect(record.receivedAt).toBe(lastWeek);
    });
  });

  describe('ownership', () => {
    it('refuses a patient from another clinic', async () => {
      await expectRejection(
        service.record(CLINIC_B, payment(), SECRETARY),
        ERROR_CODES.PATIENT_NOT_FOUND,
      );
    });

    it('refuses a treatment belonging to a different patient', async () => {
      await expectRejection(
        service.record(CLINIC_A, payment({ treatmentId: OTHER_TREATMENT_ID }), SECRETARY),
        ERROR_CODES.TREATMENT_PATIENT_MISMATCH,
      );
    });

    it('refuses a cancelled treatment', async () => {
      // Abandoned care must not absorb money, even though it exists and
      // belongs to this patient — a forged id gets no further than this.
      treatments.treatments.set(TREATMENT_ID, {
        clinicId: CLINIC_A,
        patientId: PATIENT_ID,
        agreedPrice: AGREED_PRICE,
        status: 'CANCELLED',
      });

      await expectRejection(
        service.record(CLINIC_A, payment(), SECRETARY),
        ERROR_CODES.TREATMENT_NOT_PAYABLE,
      );
      expect(cashRecords.records).toHaveLength(0);
    });

    it('refuses a completed treatment that is already fully paid', async () => {
      treatments.treatments.set(TREATMENT_ID, {
        clinicId: CLINIC_A,
        patientId: PATIENT_ID,
        agreedPrice: AGREED_PRICE,
        status: 'COMPLETED',
      });
      // Settle it, then try to pay again.
      await service.record(CLINIC_A, payment({ amount: '3600.000' }), OWNER);

      await expectRejection(
        service.record(CLINIC_A, payment({ amount: '100.000' }), SECRETARY),
        ERROR_CODES.TREATMENT_NOT_PAYABLE,
      );
    });

    it('still accepts a completed treatment that owes a balance', async () => {
      treatments.treatments.set(TREATMENT_ID, {
        clinicId: CLINIC_A,
        patientId: PATIENT_ID,
        agreedPrice: AGREED_PRICE,
        status: 'COMPLETED',
      });

      const record = await service.record(CLINIC_A, payment({ amount: '500.000' }), SECRETARY);
      expect(record.treatmentId).toBe(TREATMENT_ID);
    });

    it('refuses a treatment from another clinic', async () => {
      await expectRejection(
        service.record(CLINIC_A, payment({ treatmentId: '652f1c9b8a1e4f0012ab7777' }), SECRETARY),
        ERROR_CODES.TREATMENT_NOT_FOUND,
      );
    });

    it('requires a guardian id when the payer is a guardian', async () => {
      await expectRejection(
        service.record(CLINIC_A, payment({ payerType: PAYER_TYPES.GUARDIAN }), SECRETARY),
        ERROR_CODES.GUARDIAN_REQUIRED_FOR_PAYER_TYPE,
      );
    });

    it('refuses a guardian who is not linked to this patient', async () => {
      await expectRejection(
        service.record(
          CLINIC_A,
          payment({ payerType: PAYER_TYPES.GUARDIAN, guardianId: UNLINKED_GUARDIAN_ID }),
          SECRETARY,
        ),
        ERROR_CODES.GUARDIAN_NOT_LINKED_TO_PATIENT,
      );
    });

    it('accepts and names a linked guardian', async () => {
      const record = await service.record(
        CLINIC_A,
        payment({ payerType: PAYER_TYPES.GUARDIAN, guardianId: GUARDIAN_ID }),
        SECRETARY,
      );

      expect(record.payerType).toBe(PAYER_TYPES.GUARDIAN);
      expect(record.payerName).toBe('Fatma Ben Salah');
    });

    it('allows a payment with no treatment — a deposit before a plan exists', async () => {
      const record = await service.record(
        CLINIC_A,
        payment({ treatmentId: null, amount: '100.000' }),
        SECRETARY,
      );
      expect(record.treatmentId).toBeNull();
    });
  });

  describe('idempotency', () => {
    it('returns the original record when the same key is submitted twice', async () => {
      const input = payment({ amount: '200.000', idempotencyKey: 'submit-abc-123' });

      const first = await service.record(CLINIC_A, input, SECRETARY);
      const second = await service.record(CLINIC_A, input, SECRETARY);

      expect(second.id).toBe(first.id);
      // One payment, one receipt, one total — no double charge.
      expect(cashRecords.records).toHaveLength(1);
      expect(receiptRecords.receipts).toHaveLength(1);

      const summary = await service.summaryForTreatment(CLINIC_A, TREATMENT_ID);
      expect(summary.recordedAmountMinor).toBe(200_000);
    });

    it('creates separate records for different keys', async () => {
      await service.record(CLINIC_A, payment({ idempotencyKey: 'key-one-111' }), SECRETARY);
      await service.record(CLINIC_A, payment({ idempotencyKey: 'key-two-222' }), SECRETARY);
      expect(cashRecords.records).toHaveLength(2);
    });

    it('rejects a key reused for a different patient', async () => {
      await service.record(CLINIC_A, payment({ idempotencyKey: 'shared-key-9' }), SECRETARY);

      await expectRejection(
        service.record(
          CLINIC_A,
          payment({
            patientId: OTHER_PATIENT_ID,
            treatmentId: null,
            idempotencyKey: 'shared-key-9',
          }),
          SECRETARY,
        ),
        ERROR_CODES.IDEMPOTENCY_CONFLICT,
      );
    });
  });

  describe('receipt numbering', () => {
    it('gives every payment a distinct number', async () => {
      for (let index = 0; index < 5; index += 1) {
        await service.record(CLINIC_A, payment({ amount: '10.000' }), SECRETARY);
      }
      const numbers = receiptRecords.receipts.map((receipt) => receipt.receiptNumber);
      expect(new Set(numbers).size).toBe(5);
      expect(numbers[0]).toMatch(/-000001$/);
      expect(numbers[4]).toMatch(/-000005$/);
    });

    it('stays unique when payments are recorded concurrently', async () => {
      // Five simultaneous submissions, as five secretaries would produce. The
      // sequence is reserved atomically, so nobody receives a duplicate — and
      // the fake repository throws on a duplicate exactly as the unique index
      // would, so a regression here fails loudly instead of silently.
      await Promise.all(
        Array.from({ length: 5 }, () =>
          service.record(CLINIC_A, payment({ amount: '10.000' }), SECRETARY),
        ),
      );

      const numbers = receiptRecords.receipts.map((receipt) => receipt.receiptNumber);
      expect(numbers).toHaveLength(5);
      expect(new Set(numbers).size).toBe(5);
    });

    it('scopes numbering to the clinic, so two clinics may share a number', async () => {
      patients.patients.set(OTHER_PATIENT_ID, CLINIC_B);
      await service.record(CLINIC_A, payment({ amount: '10.000' }), SECRETARY);
      await service.record(
        CLINIC_B,
        payment({ patientId: OTHER_PATIENT_ID, treatmentId: null, amount: '10.000' }),
        SECRETARY,
      );

      const [a, b] = receiptRecords.receipts;
      expect(a?.receiptNumber).toBe(b?.receiptNumber);
      expect(a?.clinicId.toString()).not.toBe(b?.clinicId.toString());
    });
  });

  describe('overpayment', () => {
    beforeEach(async () => {
      // 3,500 of 3,600 already recorded — 100.000 TND remains.
      await service.record(CLINIC_A, payment({ amount: '3500.000' }), OWNER);
    });

    it('warns instead of failing silently, and reports the excess', async () => {
      const error = await expectRejection(
        service.record(CLINIC_A, payment({ amount: '200.000' }), OWNER),
        ERROR_CODES.PAYMENT_EXCEEDS_REMAINING_AMOUNT,
      );

      expect(error.statusCode).toBe(422);
      expect(error.details).toMatchObject({
        requiresConfirmation: true,
        remainingAmountMinor: 100_000,
        amountMinor: 200_000,
        excessAmountMinor: 100_000,
        overrideAllowed: true,
      });
      // Nothing is written before the clinic confirms.
      expect(cashRecords.records).toHaveLength(1);
    });

    it('tells an unauthorized caller that they may not confirm it', async () => {
      const error = await expectRejection(
        service.record(CLINIC_A, payment({ amount: '200.000' }), SECRETARY),
        ERROR_CODES.PAYMENT_EXCEEDS_REMAINING_AMOUNT,
      );
      expect(error.details).toMatchObject({ overrideAllowed: false });
    });

    it('records the payment when an authorized owner confirms', async () => {
      const record = await service.record(
        CLINIC_A,
        payment({ amount: '200.000', allowOverpayment: true }),
        OWNER,
      );

      expect(record.overpaymentOverride).toBe(true);
      expect(record.amountMinor).toBe(200_000);
      expect(audit.events.map((event) => event.action)).toContain(
        'cash_record.overpayment_approved',
      );
    });

    it('refuses the override from a caller without the permission', async () => {
      await expectRejection(
        service.record(CLINIC_A, payment({ amount: '200.000', allowOverpayment: true }), SECRETARY),
        ERROR_CODES.OVERPAYMENT_APPROVAL_NOT_ALLOWED,
      );
      expect(cashRecords.records).toHaveLength(1);
    });

    it('does not warn when the payment settles the balance exactly', async () => {
      const record = await service.record(CLINIC_A, payment({ amount: '100.000' }), SECRETARY);
      expect(record.overpaymentOverride).toBe(false);
    });

    it('does not apply to a payment with no treatment', async () => {
      const record = await service.record(
        CLINIC_A,
        payment({ treatmentId: null, amount: '9000.000' }),
        SECRETARY,
      );
      expect(record.amountMinor).toBe(9_000_000);
    });
  });

  describe('cancellation', () => {
    it('keeps the record, voids the receipt and drops it from the total', async () => {
      const record = await service.record(CLINIC_A, payment({ amount: '300.000' }), SECRETARY);

      const cancelled = await service.cancel(CLINIC_A, record.id, 'Incorrect amount', OWNER);

      expect(cancelled.status).toBe(CASH_RECORD_STATUSES.CANCELLED);
      expect(cancelled.cancellationReason).toBe('Incorrect amount');
      expect(cancelled.cancelledByName).toBe('Nadia Khelifi');
      // The record is still there — nothing is ever deleted.
      expect(cashRecords.records).toHaveLength(1);
      // The receipt is void but its printed amount is untouched.
      expect(receiptRecords.receipts[0]?.status).toBe(RECEIPT_STATUSES.CANCELLED);
      expect(receiptRecords.receipts[0]?.amountMinor).toBe(300_000);

      const summary = await service.summaryForTreatment(CLINIC_A, TREATMENT_ID);
      expect(summary.recordedAmountMinor).toBe(0);
      expect(summary.cancelledCount).toBe(1);
    });

    it('refuses a second cancellation', async () => {
      const record = await service.record(CLINIC_A, payment(), SECRETARY);
      await service.cancel(CLINIC_A, record.id, 'Incorrect amount', OWNER);

      await expectRejection(
        service.cancel(CLINIC_A, record.id, 'Again', OWNER),
        ERROR_CODES.CASH_RECORD_ALREADY_CANCELLED,
      );
    });

    it('refuses to cancel a record in another clinic', async () => {
      const record = await service.record(CLINIC_A, payment(), SECRETARY);
      await expectRejection(
        service.cancel(CLINIC_B, record.id, 'Not mine', OWNER),
        ERROR_CODES.CASH_RECORD_NOT_FOUND,
      );
    });
  });

  describe('correction', () => {
    it('links the replacement to the record it replaces, and both stay visible', async () => {
      const wrong = await service.record(CLINIC_A, payment({ amount: '300.000' }), SECRETARY);
      await service.cancel(CLINIC_A, wrong.id, 'Incorrect amount', OWNER);

      const corrected = await service.record(
        CLINIC_A,
        payment({ amount: '200.000', correctionOfRecordId: wrong.id }),
        SECRETARY,
      );

      expect(corrected.correctionOfRecordId).toBe(wrong.id);
      const original = await service.getById(CLINIC_A, wrong.id);
      expect(original.correctedByRecordId).toBe(corrected.id);
      expect(original.status).toBe(CASH_RECORD_STATUSES.CANCELLED);
      expect(audit.events.map((event) => event.action)).toContain('cash_record.corrected');
    });
  });

  describe('tenant isolation', () => {
    it('hides another clinic record behind a 404', async () => {
      const record = await service.record(CLINIC_A, payment(), SECRETARY);
      await expectRejection(
        service.getById(CLINIC_B, record.id),
        ERROR_CODES.CASH_RECORD_NOT_FOUND,
      );
    });

    it('never counts another clinic money in a summary', async () => {
      await service.record(CLINIC_A, payment({ amount: '500.000' }), SECRETARY);
      patients.patients.set(OTHER_PATIENT_ID, CLINIC_B);
      await service.record(
        CLINIC_B,
        payment({ patientId: OTHER_PATIENT_ID, treatmentId: null, amount: '999.000' }),
        SECRETARY,
      );

      const summary = await service.summaryForPatient(CLINIC_A, PATIENT_ID);
      expect(summary.recordedAmountMinor).toBe(500_000);
    });
  });

  describe('audit', () => {
    it('logs creation and receipt issue without copying the note', async () => {
      await service.record(
        CLINIC_A,
        payment({ note: 'Mother mentioned a family dispute about the money' }),
        SECRETARY,
      );

      const actions = audit.events.map((event) => event.action);
      expect(actions).toEqual(['cash_record.created', 'receipt.issued']);
      // Clinical and family context never leaks into the audit trail.
      expect(JSON.stringify(audit.events)).not.toContain('family dispute');
    });

    it('logs cancellation with its reason', async () => {
      const record = await service.record(CLINIC_A, payment(), SECRETARY);
      audit.events.length = 0;

      await service.cancel(CLINIC_A, record.id, 'Incorrect amount', OWNER);

      expect(audit.events.map((event) => event.action)).toEqual([
        'cash_record.cancelled',
        'receipt.cancelled',
      ]);
      expect(audit.events[0]?.metadata).toMatchObject({ reason: 'Incorrect amount' });
    });
  });

  describe('the QA scenario from the milestone brief', () => {
    it('tracks Ahmed Ben Salah through payment, mistake, cancellation and correction', async () => {
      const summary = async () => service.summaryForTreatment(CLINIC_A, TREATMENT_ID);

      // Agreed: 3,600.000 TND.
      expect((await summary()).agreedAmountMinor).toBe(3_600_000);
      expect((await summary()).remainingAmountMinor).toBe(3_600_000);

      // 500.000 in cash from the guardian, taken by the secretary.
      await service.record(
        CLINIC_A,
        payment({
          amount: '500.000',
          payerType: PAYER_TYPES.GUARDIAN,
          guardianId: GUARDIAN_ID,
        }),
        SECRETARY,
      );
      expect((await summary()).recordedAmountMinor).toBe(500_000);
      expect((await summary()).remainingAmountMinor).toBe(3_100_000);

      // 300.000 more.
      const wrong = await service.record(CLINIC_A, payment({ amount: '300.000' }), SECRETARY);
      expect((await summary()).recordedAmountMinor).toBe(800_000);
      expect((await summary()).remainingAmountMinor).toBe(2_800_000);

      // The 300 was wrong. Cancel it with a reason.
      await service.cancel(CLINIC_A, wrong.id, 'Incorrect amount', OWNER);
      expect((await summary()).recordedAmountMinor).toBe(500_000);
      expect((await summary()).remainingAmountMinor).toBe(3_100_000);

      // Record the corrected 200.000.
      await service.record(
        CLINIC_A,
        payment({ amount: '200.000', correctionOfRecordId: wrong.id }),
        SECRETARY,
      );
      const final = await summary();
      expect(final.recordedAmountMinor).toBe(700_000);
      expect(final.remainingAmountMinor).toBe(2_900_000);
      expect(formatMinor(final.remainingAmountMinor ?? 0, 'TND')).toBe('2900.000');

      // History shows all three, and every one still has its receipt.
      const { result } = await service.listForPatient(CLINIC_A, PATIENT_ID, {}, {});
      expect(result.total).toBe(3);
      expect(result.items.map((item) => item.status).sort()).toEqual([
        'CANCELLED',
        'RECORDED',
        'RECORDED',
      ]);
      expect(result.items.every((item) => item.receiptNumber !== null)).toBe(true);
    });
  });
});

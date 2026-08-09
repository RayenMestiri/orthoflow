import type { ClientSession } from 'mongoose';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import { guardianRepository, type GuardianRepository } from '../guardians/guardian.repository.js';
import { patientRepository, type PatientRepository } from '../patients/patient.repository.js';
import {
  treatmentRepository,
  type TreatmentRepository,
} from '../treatments/treatment.repository.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import {
  cashRecordRepository,
  type CashRecordRepository,
} from '../cash-records/cash-record.repository.js';
import type { CashRecordRecord } from '../cash-records/cash-record.types.js';
import { toReceiptDocumentDto } from './receipt.mapper.js';
import { receiptRepository, type ReceiptRepository } from './receipt.repository.js';
import type { CreateReceiptInput, ReceiptDocumentDto, ReceiptRecord } from './receipt.types.js';

/**
 * Issues and reads receipts.
 *
 * A receipt is created by the cash-record service inside the same unit of work
 * as the payment (see `issueFor`), never by a client calling an endpoint. There
 * is deliberately no "create receipt" route: a receipt with no payment behind
 * it is a forged document.
 */
export class ReceiptService {
  constructor(
    private readonly receipts: ReceiptRepository = receiptRepository,
    private readonly cashRecords: CashRecordRepository = cashRecordRepository,
    private readonly users: UserRepository = userRepository,
    private readonly patients: PatientRepository = patientRepository,
    private readonly guardians: GuardianRepository = guardianRepository,
    private readonly treatments: TreatmentRepository = treatmentRepository,
    private readonly clinics: ClinicRepository = clinicRepository,
  ) {}

  /**
   * Mints the receipt for a freshly created cash record.
   *
   * The number is reserved from the atomic counter, so two secretaries
   * recording payments in the same second cannot receive the same one. Called
   * with the payment's session when transactions are available, so a receipt
   * cannot survive a rolled-back payment.
   */
  async issueFor(
    record: CashRecordRecord,
    issuedBy: string,
    session?: ClientSession,
  ): Promise<ReceiptRecord> {
    const clinicId = record.clinicId.toString();
    const year = record.receivedAt.getUTCFullYear();
    const receiptNumber = await this.receipts.reserveReceiptNumber(clinicId, year, session);

    const input: CreateReceiptInput = {
      clinicId,
      patientId: record.patientId.toString(),
      treatmentId: record.treatmentId?.toString() ?? null,
      cashRecordId: record._id.toString(),
      receiptNumber,
      // Frozen copies: the receipt is a snapshot, not a live view of the record.
      amountMinor: record.amountMinor,
      currency: record.currency,
      paymentMethod: record.paymentMethod,
      issuedAt: new Date(),
      issuedBy,
    };

    return this.receipts.create(input, session);
  }

  /** Follows a cancelled payment. The amount is never rewritten. */
  async markCancelledFor(
    record: CashRecordRecord,
    session?: ClientSession,
  ): Promise<ReceiptRecord | null> {
    if (!record.receiptId) {
      return null;
    }
    return this.receipts.markCancelled(
      record.receiptId.toString(),
      record.clinicId.toString(),
      session,
    );
  }

  async getByCashRecord(clinicId: string, cashRecordId: string): Promise<ReceiptDocumentDto> {
    const record = await this.cashRecords.findByIdInClinic(cashRecordId, clinicId);
    if (!record) {
      throw new NotFoundError('Cash record not found', {
        code: ERROR_CODES.CASH_RECORD_NOT_FOUND,
      });
    }

    const receipt = await this.receipts.findByCashRecord(cashRecordId, clinicId);
    if (!receipt) {
      throw new NotFoundError('Receipt not found', { code: ERROR_CODES.RECEIPT_NOT_FOUND });
    }

    return this.buildDocument(clinicId, receipt, record);
  }

  async getById(clinicId: string, receiptId: string): Promise<ReceiptDocumentDto> {
    const receipt = await this.receipts.findByIdInClinic(receiptId, clinicId);
    if (!receipt) {
      throw new NotFoundError('Receipt not found', { code: ERROR_CODES.RECEIPT_NOT_FOUND });
    }

    const record = await this.cashRecords.findByIdInClinic(
      receipt.cashRecordId.toString(),
      clinicId,
    );
    if (!record) {
      // Only reachable if a payment were deleted, which no code path allows.
      throw new NotFoundError('Cash record not found', {
        code: ERROR_CODES.CASH_RECORD_NOT_FOUND,
      });
    }

    return this.buildDocument(clinicId, receipt, record);
  }

  /**
   * Resolves every id on the receipt into something printable.
   *
   * Done here rather than in the mapper because it needs the database, and done
   * at read time rather than at issue time because a clinic that corrects its
   * phone number should not have to reprint its history.
   */
  private async buildDocument(
    clinicId: string,
    receipt: ReceiptRecord,
    record: CashRecordRecord,
  ): Promise<ReceiptDocumentDto> {
    const [issuer, clinic, patient, guardians, treatment] = await Promise.all([
      this.users.findById(receipt.issuedBy.toString()),
      this.clinics.findById(clinicId),
      this.patients.findByIdInClinic(receipt.patientId.toString(), clinicId),
      record.guardianId
        ? this.guardians.findManyByIdsInClinic([record.guardianId.toString()], clinicId)
        : Promise.resolve([]),
      record.treatmentId
        ? this.treatments.findByIdInClinic(record.treatmentId.toString(), clinicId)
        : Promise.resolve(null),
    ]);

    const guardian = guardians[0];

    return toReceiptDocumentDto(receipt, {
      issuedByName: issuer ? `${issuer.firstName} ${issuer.lastName}`.trim() : 'Clinic team member',
      clinicName: clinic?.name ?? 'Clinic',
      clinicAddress: clinic
        ? [clinic.address.line1, clinic.address.city, clinic.address.country]
            .filter(Boolean)
            .join(', ') || null
        : null,
      clinicPhone: clinic?.phone ?? null,
      patientName: patient ? `${patient.firstName} ${patient.lastName}`.trim() : 'Patient',
      // Read-only view of Treatment: its label, never its state.
      treatmentLabel: treatment
        ? (treatment.customTypeLabel ?? formatTreatmentType(treatment.type))
        : null,
      payerName: guardian
        ? `${guardian.firstName} ${guardian.lastName}`.trim()
        : (record.payerLabel ?? null),
      cancellationReason: record.cancellationReason ?? null,
    });
  }
}

/** `METAL_BRACES` → `Metal braces`. Presentation only; Treatment owns the enum. */
function formatTreatmentType(type: string): string {
  const words = type.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const receiptService = new ReceiptService();

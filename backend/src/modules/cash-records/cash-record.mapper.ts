import { formatMinor } from '../../common/utils/money.js';
import type { CashRecordDto, CashRecordRecord } from './cash-record.types.js';

/**
 * Names the DTO needs but the record only stores as ids.
 *
 * Resolved by the service in one batch, then handed here — a mapper never
 * queries. The UI must never render a raw ObjectId at a clinic user.
 */
export interface CashRecordDisplayContext {
  receivedByName: string;
  cancelledByName: string | null;
  payerName: string | null;
  receiptNumber: string | null;
}

export function toCashRecordDto(
  record: CashRecordRecord,
  context: CashRecordDisplayContext,
): CashRecordDto {
  return {
    id: record._id.toString(),
    clinicId: record.clinicId.toString(),
    patientId: record.patientId.toString(),
    treatmentId: record.treatmentId?.toString() ?? null,

    payerType: record.payerType,
    guardianId: record.guardianId?.toString() ?? null,
    payerLabel: record.payerLabel ?? null,
    payerName: context.payerName,

    amountMinor: record.amountMinor,
    // Display convenience only. `amountMinor` remains the authoritative value;
    // no client is ever asked to parse this string back into money.
    amountFormatted: formatMinor(record.amountMinor, record.currency),
    currency: record.currency,

    paymentMethod: record.paymentMethod,

    receivedAt: record.receivedAt.toISOString(),
    receivedByUserId: record.receivedByUserId.toString(),
    receivedByName: context.receivedByName,

    purpose: record.purpose ?? null,
    note: record.note ?? null,

    status: record.status,

    receiptId: record.receiptId?.toString() ?? null,
    receiptNumber: context.receiptNumber,

    overpaymentOverride: record.overpaymentOverride,

    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    cancelledByName: context.cancelledByName,
    cancellationReason: record.cancellationReason ?? null,

    correctedByRecordId: record.correctedByRecordId?.toString() ?? null,
    correctionOfRecordId: record.correctionOfRecordId?.toString() ?? null,

    createdAt: record.createdAt.toISOString(),
  };
}

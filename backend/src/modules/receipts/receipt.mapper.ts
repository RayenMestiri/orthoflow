import { formatMinor } from '../../common/utils/money.js';
import type { ReceiptDocumentDto, ReceiptDto, ReceiptRecord } from './receipt.types.js';

export function toReceiptDto(record: ReceiptRecord, issuedByName: string): ReceiptDto {
  return {
    id: record._id.toString(),
    receiptNumber: record.receiptNumber,
    clinicId: record.clinicId.toString(),
    patientId: record.patientId.toString(),
    treatmentId: record.treatmentId?.toString() ?? null,
    cashRecordId: record.cashRecordId.toString(),

    amountMinor: record.amountMinor,
    amountFormatted: formatMinor(record.amountMinor, record.currency),
    currency: record.currency,
    paymentMethod: record.paymentMethod,

    issuedAt: record.issuedAt.toISOString(),
    issuedByName,
    status: record.status,
  };
}

/** Everything the printable receipt shows, with no ids left to resolve. */
export interface ReceiptDocumentContext {
  issuedByName: string;
  clinicName: string;
  clinicAddress: string | null;
  clinicPhone: string | null;
  patientName: string;
  treatmentLabel: string | null;
  payerName: string | null;
  cancellationReason: string | null;
}

export function toReceiptDocumentDto(
  record: ReceiptRecord,
  context: ReceiptDocumentContext,
): ReceiptDocumentDto {
  return {
    ...toReceiptDto(record, context.issuedByName),
    clinicName: context.clinicName,
    clinicAddress: context.clinicAddress,
    clinicPhone: context.clinicPhone,
    patientName: context.patientName,
    treatmentLabel: context.treatmentLabel,
    payerName: context.payerName,
    cancellationReason: context.cancellationReason,
  };
}

import type { Types } from 'mongoose';
import type { PaymentMethod } from '../cash-records/cash-record.types.js';

/**
 * A Receipt is the printable evidence of what the clinic recorded.
 *
 * It is issued once, alongside its cash record, and then never rewritten. If
 * the payment was wrong, the record is cancelled — the receipt follows it into
 * CANCELLED and a *new* receipt is issued for the corrected amount. Editing the
 * amount on an already-printed receipt would mean the paper in a parent's hand
 * and the row in the database disagree, which is exactly the dispute this
 * product exists to prevent.
 */

export const RECEIPT_STATUSES = {
  ISSUED: 'ISSUED',
  /** Its cash record was cancelled. The document stays, clearly marked void. */
  CANCELLED: 'CANCELLED',
} as const;

export type ReceiptStatus = (typeof RECEIPT_STATUSES)[keyof typeof RECEIPT_STATUSES];

export const RECEIPT_STATUS_VALUES = Object.values(RECEIPT_STATUSES) as [
  ReceiptStatus,
  ...ReceiptStatus[],
];

/** `REC-2026-000042`. Padded so a year's receipts sort lexicographically. */
export const RECEIPT_NUMBER_PREFIX = 'REC';
const SEQUENCE_PAD = 6;

export function formatReceiptNumber(year: number, sequence: number): string {
  return `${RECEIPT_NUMBER_PREFIX}-${year}-${String(sequence).padStart(SEQUENCE_PAD, '0')}`;
}

/** Counter key: one sequence per clinic per year, as AGENTS.md §20 prescribes. */
export function receiptCounterKey(clinicId: string, year: number): string {
  return `receipt:${clinicId}:${year}`;
}

export interface ReceiptAttributes {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  treatmentId: Types.ObjectId | null;
  cashRecordId: Types.ObjectId;

  /** Unique within the clinic. Printed, quoted on the phone, never re-used. */
  receiptNumber: string;

  /** Frozen copies of the payment at issue time — a receipt is a snapshot. */
  amountMinor: number;
  currency: string;
  paymentMethod: PaymentMethod;

  issuedAt: Date;
  issuedBy: Types.ObjectId;

  status: ReceiptStatus;

  createdAt: Date;
  updatedAt: Date;
}

export type ReceiptRecord = ReceiptAttributes & { _id: Types.ObjectId };

export interface CreateReceiptInput {
  clinicId: string;
  patientId: string;
  treatmentId?: string | null;
  cashRecordId: string;
  receiptNumber: string;
  amountMinor: number;
  currency: string;
  paymentMethod: PaymentMethod;
  issuedAt: Date;
  issuedBy: string;
}

export interface ReceiptDto {
  id: string;
  receiptNumber: string;
  clinicId: string;
  patientId: string;
  treatmentId: string | null;
  cashRecordId: string;

  amountMinor: number;
  amountFormatted: string;
  currency: string;
  paymentMethod: PaymentMethod;

  issuedAt: string;
  issuedByName: string;
  status: ReceiptStatus;
}

/** Everything the printable receipt renders, resolved server-side. */
export interface ReceiptDocumentDto extends ReceiptDto {
  clinicName: string;
  clinicAddress: string | null;
  clinicPhone: string | null;
  patientName: string;
  treatmentLabel: string | null;
  payerName: string | null;
  /** Present when the underlying record was voided, so print shows it. */
  cancellationReason: string | null;
}

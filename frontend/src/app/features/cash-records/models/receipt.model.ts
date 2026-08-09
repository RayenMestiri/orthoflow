import type { PaymentMethod, ReceiptStatus } from './cash-record.model';

/**
 * Everything the printable receipt shows, resolved server-side.
 *
 * A receipt is issued with its payment and never rewritten. When the payment is
 * cancelled the receipt keeps its printed amount and its status becomes
 * CANCELLED, so paper and screen never disagree.
 */
export interface ReceiptDocument {
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

  clinicName: string;
  clinicAddress: string | null;
  clinicPhone: string | null;
  patientName: string;
  treatmentLabel: string | null;
  payerName: string | null;
  cancellationReason: string | null;
}

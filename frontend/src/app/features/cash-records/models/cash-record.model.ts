/**
 * A cash record is the clinic's acknowledgment that it physically received
 * money. OrthoFlow processes no payments: there is no gateway, no card data and
 * no transfer of funds anywhere in this feature. Every label in the UI must
 * say "recorded", never "paid online".
 */

export type PaymentMethod = 'CASH' | 'CARD_AT_CLINIC' | 'BANK_TRANSFER' | 'OTHER';
export type PayerType = 'SELF' | 'GUARDIAN' | 'OTHER';
export type CashRecordStatus = 'RECORDED' | 'CANCELLED';
export type ReceiptStatus = 'ISSUED' | 'CANCELLED';

export interface CashRecord {
  id: string;
  clinicId: string;
  patientId: string;
  treatmentId: string | null;

  payerType: PayerType;
  guardianId: string | null;
  payerLabel: string | null;
  payerName: string | null;

  /** Integer minor units — millimes for TND. The authoritative figure. */
  amountMinor: number;
  /** Server-rendered major-unit string, e.g. `'200.000'`. Display only. */
  amountFormatted: string;
  currency: string;

  paymentMethod: PaymentMethod;

  receivedAt: string;
  receivedByUserId: string;
  receivedByName: string;

  purpose: string | null;
  note: string | null;

  status: CashRecordStatus;

  receiptId: string | null;
  receiptNumber: string | null;

  overpaymentOverride: boolean;

  cancelledAt: string | null;
  cancelledByName: string | null;
  cancellationReason: string | null;

  correctedByRecordId: string | null;
  correctionOfRecordId: string | null;

  createdAt: string;
}

export interface RecordPaymentInput {
  treatmentId?: string | null;
  payerType: PayerType;
  guardianId?: string | null;
  payerLabel?: string | null;
  /** Sent as a string so the digits the user typed survive the wire. */
  amount: string;
  paymentMethod: PaymentMethod;
  receivedAt?: string | null;
  note?: string | null;
  /** Same key on a retry means the same payment. Generated per drawer opening. */
  idempotencyKey: string;
  allowOverpayment?: boolean;
  correctionOfRecordId?: string | null;
}

/** Detail the server attaches to a `PAYMENT_EXCEEDS_REMAINING_AMOUNT` warning. */
export interface OverpaymentWarning {
  requiresConfirmation: true;
  currency: string;
  remainingAmountMinor: number;
  amountMinor: number;
  excessAmountMinor: number;
  /** Whether this user may confirm it, so the UI knows what to offer. */
  overrideAllowed: boolean;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  // Explicitly worded: the clinic's own terminal, not an OrthoFlow payment.
  CARD_AT_CLINIC: 'Card at clinic',
  BANK_TRANSFER: 'Bank transfer',
  OTHER: 'Other',
};

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'CASH',
  'CARD_AT_CLINIC',
  'BANK_TRANSFER',
  'OTHER',
];

export const PAYER_TYPE_LABELS: Record<PayerType, string> = {
  SELF: 'Patient',
  GUARDIAN: 'Guardian',
  OTHER: 'Someone else',
};

export const CASH_RECORD_STATUS_LABELS: Record<CashRecordStatus, string> = {
  RECORDED: 'Recorded',
  CANCELLED: 'Cancelled',
};

/** History filter. Deliberately three options — this is not an accounting suite. */
export type CashRecordFilter = 'ALL' | 'RECORDED' | 'CANCELLED';

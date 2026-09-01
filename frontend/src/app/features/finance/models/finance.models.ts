/**
 * Clinic-wide financial operations.
 *
 * Every figure here is derived server-side from `treatment.agreedPrice` and the
 * cash-record ledger. The frontend renders these numbers; it never computes
 * them. Amounts are integer minor units — millimes for TND — and are formatted
 * for display only, never used in arithmetic here.
 *
 * SEMANTICS: "received" is money the clinic acknowledged receiving.
 * "Outstanding" is agreed treatment value not yet received. They are different
 * kinds of number and must never be summed or labelled as revenue.
 */

export type PaymentStatus =
  'NO_PAYMENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID' | 'NO_AGREED_PRICE';

export type BalanceFilter = 'ALL' | 'OUTSTANDING' | 'PAID' | 'NO_PAYMENT' | 'OVERPAID';

export type BalanceSort = 'REMAINING_DESC' | 'REMAINING_ASC' | 'RECENTLY_PAID' | 'PATIENT_NAME';

export interface FinanceSummary {
  currency: string;
  receivedTodayMinor: number;
  receivedTodayCount: number;
  receivedMonthMinor: number;
  receivedMonthCount: number;
  outstandingMinor: number;
  outstandingPatientCount: number;
  activeTreatmentPatientCount: number;
  totalAgreedMinor: number;
  totalRecordedMinor: number;
  /** Recorded ÷ agreed, clamped 0–100 by the server. */
  collectedPercent: number;
}

export interface FinanceAttention {
  outstandingCount: number;
  noPaymentCount: number;
  overpaidCount: number;
  cancelledUncorrectedCount: number;
  overpaidExcessMinor: number;
  outstandingMinor: number;
}

/** Treatment counts per derived status, for the health bar and filter pills. */
export interface FinanceDistribution {
  paid: number;
  partiallyPaid: number;
  noPayment: number;
  overpaid: number;
  noAgreedPrice: number;
  overpaidExcessMinor: number;
}

export interface FinanceOverview {
  summary: FinanceSummary;
  attention: FinanceAttention;
  distribution: FinanceDistribution;
}

export interface PatientBalance {
  patientId: string;
  patientName: string;
  treatmentId: string;
  treatmentLabel: string;
  treatmentStatus: string;
  agreedMinor: number | null;
  recordedMinor: number;
  /** Null when no price was agreed — not a zero, which would read as settled. */
  remainingMinor: number | null;
  overpaidMinor: number | null;
  paymentStatus: PaymentStatus;
  lastPaymentAt: string | null;
}

export interface FinanceActivityEntry {
  cashRecordId: string;
  patientId: string;
  patientName: string;
  treatmentLabel?: string | null;
  payerType?: string | null;
  payerLabel?: string | null;
  note?: string | null;
  purpose?: string | null;
  amountMinor: number;
  currency: string;
  paymentMethod: string;
  status: string;
  receiptNumber: string | null;
  receivedAt: string;
  receivedByName: string;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancellationReason: string | null;
}

/**
 * Whether a course of care can receive money right now.
 *
 * Mirrors `isTreatmentPayable` in the backend finance module so the selector
 * only ever offers options the server will accept. The server re-checks
 * regardless — this decides what to *show*, never what is *allowed*.
 */
export function isTreatmentPayable(
  treatmentStatus: string,
  remainingMinor: number | null,
): boolean {
  if (treatmentStatus === 'CANCELLED') {
    return false;
  }
  if (treatmentStatus === 'COMPLETED') {
    return remainingMinor === null || remainingMinor > 0;
  }
  return true;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  NO_PAYMENT: 'No payment',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  OVERPAID: 'Overpaid',
  NO_AGREED_PRICE: 'No agreed price',
};

export const BALANCE_FILTERS: readonly { value: BalanceFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'OUTSTANDING', label: 'Outstanding' },
  { value: 'PAID', label: 'Paid' },
  { value: 'NO_PAYMENT', label: 'No payment' },
  { value: 'OVERPAID', label: 'Overpaid' },
];

export const BALANCE_SORTS: readonly { value: BalanceSort; label: string }[] = [
  { value: 'REMAINING_DESC', label: 'Highest remaining' },
  { value: 'REMAINING_ASC', label: 'Lowest remaining' },
  { value: 'RECENTLY_PAID', label: 'Recently paid' },
  { value: 'PATIENT_NAME', label: 'Patient name' },
];

/**
 * The clinic-wide financial operations read model.
 *
 * This module owns NO data. It is a read side over two authoritative sources
 * that already exist: `treatments.agreedPrice` (what the clinic agreed to
 * charge) and `cashRecords` (what the clinic acknowledges receiving). Nothing
 * here is persisted — no `patient.totalPaid`, no `treatment.balance` — because
 * a stored total is a total that drifts from the ledger.
 *
 * SEMANTICS THAT MUST NOT BLUR: agreed price is commercial treatment value, not
 * revenue. Recorded money is money physically received. Never add them, never
 * label a sum of agreed prices as income.
 */

/**
 * Where a treatment stands financially. Always derived, never stored.
 *
 * The order matters when reading the rules below: `NO_AGREED_PRICE` wins first,
 * because without a price there is no balance to reason about at all.
 */
export const PAYMENT_STATUSES = {
  /** A price was agreed but nothing has been recorded against it yet. */
  NO_PAYMENT: 'NO_PAYMENT',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  /** More was received than agreed. Worth a look, not necessarily wrong. */
  OVERPAID: 'OVERPAID',
  /** No agreed price on the treatment, so "remaining" is meaningless. */
  NO_AGREED_PRICE: 'NO_AGREED_PRICE',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[keyof typeof PAYMENT_STATUSES];

export const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUSES) as [
  PaymentStatus,
  ...PaymentStatus[],
];

/**
 * Derives the status from the two authoritative figures.
 *
 * Pure and total: every combination lands on exactly one status, so the table,
 * the counters and the filters can never disagree about a row.
 */
export function derivePaymentStatus(
  agreedMinor: number | null,
  recordedMinor: number,
): PaymentStatus {
  if (agreedMinor === null || agreedMinor <= 0) {
    return PAYMENT_STATUSES.NO_AGREED_PRICE;
  }
  if (recordedMinor <= 0) {
    return PAYMENT_STATUSES.NO_PAYMENT;
  }
  if (recordedMinor > agreedMinor) {
    return PAYMENT_STATUSES.OVERPAID;
  }
  return recordedMinor === agreedMinor
    ? PAYMENT_STATUSES.PAID
    : PAYMENT_STATUSES.PARTIALLY_PAID;
}

/** How the balances table may be ordered. */
export const BALANCE_SORTS = {
  REMAINING_DESC: 'REMAINING_DESC',
  REMAINING_ASC: 'REMAINING_ASC',
  RECENTLY_PAID: 'RECENTLY_PAID',
  PATIENT_NAME: 'PATIENT_NAME',
} as const;

export type BalanceSort = (typeof BALANCE_SORTS)[keyof typeof BALANCE_SORTS];

export const BALANCE_SORT_VALUES = Object.values(BALANCE_SORTS) as [BalanceSort, ...BalanceSort[]];

/** Table filter. `ALL` is every treatment row, including settled ones. */
export const BALANCE_FILTERS = {
  ALL: 'ALL',
  OUTSTANDING: 'OUTSTANDING',
  PAID: 'PAID',
  NO_PAYMENT: 'NO_PAYMENT',
  OVERPAID: 'OVERPAID',
} as const;

export type BalanceFilter = (typeof BALANCE_FILTERS)[keyof typeof BALANCE_FILTERS];

export const BALANCE_FILTER_VALUES = Object.values(BALANCE_FILTERS) as [
  BalanceFilter,
  ...BalanceFilter[],
];

export interface PatientBalanceQuery {
  filter?: BalanceFilter;
  search?: string;
  sort?: BalanceSort;
}

/** One row of the balances table. Deliberately small — no full documents. */
export interface PatientBalanceRow {
  patientId: string;
  patientName: string;
  treatmentId: string;
  treatmentLabel: string;
  treatmentStatus: string;

  agreedMinor: number | null;
  recordedMinor: number;
  /** Null when there is no agreed price to subtract from. Never a fake zero. */
  remainingMinor: number | null;
  /** Positive amount received above the agreed price, when overpaid. */
  overpaidMinor: number | null;

  paymentStatus: PaymentStatus;
  lastPaymentAt: string | null;
}

export interface FinanceSummary {
  currency: string;

  receivedTodayMinor: number;
  receivedTodayCount: number;

  receivedMonthMinor: number;
  receivedMonthCount: number;

  /** Sum of positive remaining balances across treatments with a price. */
  outstandingMinor: number;
  outstandingPatientCount: number;

  activeTreatmentPatientCount: number;
}

/** Compact operational worklist. Counts only — the table does the detail. */
export interface FinanceAttention {
  outstandingCount: number;
  noPaymentCount: number;
  overpaidCount: number;
  /**
   * Cancelled records with no linked correction. Named carefully: this is
   * "worth a look", not "an error". A cancellation may be final and correct.
   */
  cancelledUncorrectedCount: number;
}

export interface FinanceOverview {
  summary: FinanceSummary;
  attention: FinanceAttention;
}

/** One entry in the clinic-wide recent activity feed. */
export interface FinanceActivityEntry {
  cashRecordId: string;
  patientId: string;
  patientName: string;
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

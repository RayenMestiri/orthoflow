import type { Types } from 'mongoose';

/**
 * A CashRecord is the clinic's acknowledgment that it physically received
 * money. It is NOT a bank transaction, NOT proof that OrthoFlow moved funds,
 * and NOT online payment processing — there is no gateway anywhere in this
 * codebase. See backend/AGENTS.md §2.1.
 *
 * The product problem it solves is a dispute: a parent gives a child 200 TND
 * for the orthodontist, and weeks later nobody agrees on what reached the desk.
 * Every field below exists so that conversation has an answer.
 */

export const PAYMENT_METHODS = {
  CASH: 'CASH',
  /** The clinic's own terminal. OrthoFlow stores no card data of any kind. */
  CARD_AT_CLINIC: 'CARD_AT_CLINIC',
  BANK_TRANSFER: 'BANK_TRANSFER',
  OTHER: 'OTHER',
} as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export const PAYMENT_METHOD_VALUES = Object.values(PAYMENT_METHODS) as [
  PaymentMethod,
  ...PaymentMethod[],
];

export const DEFAULT_PAYMENT_METHOD: PaymentMethod = PAYMENT_METHODS.CASH;

/** Who handed the money over. Minors are the normal case, not the exception. */
export const PAYER_TYPES = {
  /** The patient paid for themselves — the adult case. */
  SELF: 'SELF',
  /** A guardian linked to this patient. `guardianId` is then required. */
  GUARDIAN: 'GUARDIAN',
  /** Anyone else: a relative, an employer, a sponsor. Optionally labelled. */
  OTHER: 'OTHER',
} as const;

export type PayerType = (typeof PAYER_TYPES)[keyof typeof PAYER_TYPES];

export const PAYER_TYPE_VALUES = Object.values(PAYER_TYPES) as [PayerType, ...PayerType[]];

/**
 * Record lifecycle.
 *
 * There is no DELETE. A wrong record is CANCELLED with a reason and, when it is
 * being replaced, the compensating record links back to it. Financial history
 * stays legible even when it records a mistake.
 */
export const CASH_RECORD_STATUSES = {
  /** Counts toward the recorded total. */
  RECORDED: 'RECORDED',
  /** Voided. Contributes zero, stays visible forever. */
  CANCELLED: 'CANCELLED',
} as const;

export type CashRecordStatus = (typeof CASH_RECORD_STATUSES)[keyof typeof CASH_RECORD_STATUSES];

export const CASH_RECORD_STATUS_VALUES = Object.values(CASH_RECORD_STATUSES) as [
  CashRecordStatus,
  ...CashRecordStatus[],
];

/** Only RECORDED money counts. This is the whole ledger rule. */
export function countsTowardTotal(status: CashRecordStatus): boolean {
  return status === CASH_RECORD_STATUSES.RECORDED;
}

/**
 * How far back staff may date a payment.
 *
 * Backdating is a real workflow — the receipt book gets typed up on Monday —
 * but an unbounded past is how a record lands in the wrong financial year by
 * typo. Future dates are refused outright: the clinic cannot have received
 * money it has not received yet.
 */
export const MAX_BACKDATE_DAYS = 90;

/**
 * A recorded payment.
 *
 * FUTURE — PARENT PORTAL: a guardian will eventually read their own child's
 * records. Everything needed for that is already here (`patientId`,
 * `guardianId`, `status`, `receiptId`); what is missing is a guardian-scoped
 * authorization path, deliberately not built. See the handoff notes.
 */
export interface CashRecordAttributes {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  /** Optional: a payment may be a deposit before any treatment is agreed. */
  treatmentId: Types.ObjectId | null;

  payerType: PayerType;
  guardianId: Types.ObjectId | null;
  /** Free-text name when `payerType` is OTHER. Never a stored identity. */
  payerLabel: string | null;

  /** Integer minor units — millimes for TND. Never a float. See utils/money.ts. */
  amountMinor: number;
  /** ISO-4217, copied from the clinic at record time so history cannot shift. */
  currency: string;

  paymentMethod: PaymentMethod;

  receivedAt: Date;
  /** Resolved from the authenticated session. Never accepted from a payload. */
  receivedByUserId: Types.ObjectId;

  purpose: string | null;
  note: string | null;

  status: CashRecordStatus;

  receiptId: Types.ObjectId | null;

  overpaymentOverride: boolean;
  overpaymentApprovedBy: Types.ObjectId | null;

  /** Unique per clinic. Makes a double-submitted payment a no-op. */
  idempotencyKey: string | null;

  createdBy: Types.ObjectId;

  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;

  /** The record that replaced this one after a correction. */
  correctedByRecordId: Types.ObjectId | null;
  /** The mistaken record this one replaces. */
  correctionOfRecordId: Types.ObjectId | null;

  createdAt: Date;
  updatedAt: Date;
}

export type CashRecordRecord = CashRecordAttributes & { _id: Types.ObjectId };

// --- inputs -----------------------------------------------------------------

export interface CreateCashRecordInput {
  clinicId: string;
  patientId: string;
  treatmentId?: string | null;
  payerType: PayerType;
  guardianId?: string | null;
  payerLabel?: string | null;
  amountMinor: number;
  currency: string;
  paymentMethod: PaymentMethod;
  receivedAt: Date;
  receivedByUserId: string;
  purpose?: string | null;
  note?: string | null;
  overpaymentOverride?: boolean;
  overpaymentApprovedBy?: string | null;
  idempotencyKey?: string | null;
  correctionOfRecordId?: string | null;
  createdBy: string;
}

export interface CancelCashRecordFields {
  cancelledBy: string;
  cancellationReason: string;
}

export interface CashRecordListFilters {
  patientId?: string;
  treatmentId?: string;
  status?: CashRecordStatus;
  from?: Date;
  to?: Date;
}

// --- API shapes -------------------------------------------------------------

export interface CashRecordDto {
  id: string;
  clinicId: string;
  patientId: string;
  treatmentId: string | null;

  payerType: PayerType;
  guardianId: string | null;
  payerLabel: string | null;
  /** Resolved display name, so the UI never renders a raw id. */
  payerName: string | null;

  amountMinor: number;
  /** Major-unit decimal string, e.g. `'200.000'` — display only. */
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

/**
 * Derived financial position. Never persisted, never accepted from a client.
 *
 * `recordedAmountMinor` is the sum of RECORDED cash records; cancelled ones
 * contribute zero. `remainingAmountMinor` is agreed minus recorded, and is null
 * when no agreed price exists to subtract from.
 */
export interface FinancialSummaryDto {
  patientId: string;
  treatmentId: string | null;
  currency: string;
  agreedAmountMinor: number | null;
  recordedAmountMinor: number;
  remainingAmountMinor: number | null;
  recordCount: number;
  cancelledCount: number;
}

/** Detail returned with a `PAYMENT_EXCEEDS_REMAINING_AMOUNT` warning. */
export interface OverpaymentWarningDetails {
  requiresConfirmation: true;
  currency: string;
  remainingAmountMinor: number;
  amountMinor: number;
  excessAmountMinor: number;
  /** Whether this caller may confirm it, so the UI knows what to offer. */
  overrideAllowed: boolean;
}

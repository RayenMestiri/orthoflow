/**
 * The clinic's derived financial position, computed by the backend on every
 * read.
 *
 * The frontend never computes an authoritative total. Anything derived in a
 * component is a display helper, and the moment it disagrees with this object,
 * this object is right.
 */
export interface FinancialSummary {
  patientId: string;
  treatmentId: string | null;
  currency: string;
  /** Null when no treatment is in scope, or when no price was agreed. */
  agreedAmountMinor: number | null;
  recordedAmountMinor: number;
  /** Null for the same reason as `agreedAmountMinor` — not zero. */
  remainingAmountMinor: number | null;
  recordCount: number;
  cancelledCount: number;
}

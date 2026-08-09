/**
 * A single event in the activity timeline for a payment record.
 * Populated from the clinic-scoped audit log by the backend.
 * actorName is resolved server-side (user repository join).
 */
export interface CashRecordActivity {
  id: string;
  action: string;
  /** ISO datetime from the audit log entry */
  createdAt: string;
  actorUserId: string | null;
  /** Resolved full name of the staff member who performed the action. */
  actorName: string | null;
  metadata: Record<string, unknown>;
}

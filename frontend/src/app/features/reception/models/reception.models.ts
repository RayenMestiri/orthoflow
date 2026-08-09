/**
 * Today's clinic flow.
 *
 * The server sends timestamps, never durations: "waiting 12 min" is computed
 * here and re-computed on a local tick, so the number climbs without a request
 * every minute.
 */

import type { ClinicRole } from '../../../core/auth/auth.models';

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'ARRIVED'
  | 'WAITING'
  | 'IN_TREATMENT'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED';

export type FlowGroup =
  'IN_TREATMENT' | 'WAITING' | 'ARRIVED' | 'LATE' | 'UPCOMING' | 'COMPLETED' | 'CLOSED';

export interface ReceptionRow {
  appointmentId: string;
  patientId: string;
  patientName: string;
  appointmentTypeName: string;
  treatmentLabel: string | null;

  startAt: string;
  endAt: string;
  durationMinutes: number;

  status: AppointmentStatus;
  flowGroup: FlowGroup;
  lateByMinutes: number | null;

  arrivedAt: string | null;
  waitingSince: string | null;
  treatmentStartedAt: string | null;
  completedAt: string | null;
  noShowAt: string | null;

  note: string | null;
  cancellationReason: string | null;
}

export interface ReceptionSummary {
  total: number;
  completed: number;
  waiting: number;
  inTreatment: number;
  late: number;
  upcoming: number;
  noShow: number;
  cancelled: number;
}

export interface ReceptionBoard {
  date: string;
  timezone: string;
  generatedAt: string;
  summary: ReceptionSummary;
  rows: ReceptionRow[];
}

/**
 * One recorded operational action on an appointment.
 *
 * The server names the actor; the client never guesses. If a role is missing —
 * a system event, or someone who has since left the clinic — it stays absent
 * rather than being filled in with the person currently looking at the screen.
 */
export interface AppointmentActivity {
  id: string;
  action: string;
  actorName: string;
  actorRole: ClinicRole | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Role wording for the timeline. Never the raw enum. */
export const ROLE_LABELS: Record<ClinicRole, string> = {
  CLINIC_OWNER: 'Owner',
  ORTHODONTIST: 'Orthodontist',
  DENTIST: 'Dentist',
  SECRETARY: 'Secretary',
  ASSISTANT: 'Assistant',
};

const ACTION_LABELS: Record<string, string> = {
  'appointment.created': 'Appointment booked',
  'appointment.updated': 'Appointment updated',
  'appointment.rescheduled': 'Appointment rescheduled',
  'appointment.duration_changed': 'Duration changed',
  'appointment.overbooked': 'Booked over capacity',
  'appointment.cancelled': 'Appointment cancelled',
  'appointment.no_show': 'Marked no-show',
};

/**
 * What actually happened, in the clinic's words.
 *
 * A status change carries its destination in metadata, so the timeline can say
 * "Visit started" instead of the useless "Status changed".
 */
export function activityLabel(entry: AppointmentActivity): string {
  if (entry.action === 'appointment.status_changed') {
    const to = entry.metadata['to'];
    if (typeof to === 'string' && to in STATUS_TRANSITION_LABELS) {
      return STATUS_TRANSITION_LABELS[to as AppointmentStatus];
    }
    return 'Status changed';
  }
  return ACTION_LABELS[entry.action] ?? 'Appointment activity';
}

const STATUS_TRANSITION_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Moved back to scheduled',
  CONFIRMED: 'Appointment confirmed',
  ARRIVED: 'Patient arrived',
  WAITING: 'Moved to waiting',
  IN_TREATMENT: 'Visit started',
  COMPLETED: 'Visit completed',
  NO_SHOW: 'Marked no-show',
  CANCELLED: 'Appointment cancelled',
};

/** `Sarah Trabelsi · Secretary`, or just the name when the role is unknown. */
export function actorLine(entry: AppointmentActivity): string {
  return entry.actorRole ? `${entry.actorName} · ${ROLE_LABELS[entry.actorRole]}` : entry.actorName;
}

/** Status wording. Never an enum shown raw to a clinician. */
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Scheduled',
  CONFIRMED: 'Confirmed',
  ARRIVED: 'Arrived',
  WAITING: 'Waiting',
  IN_TREATMENT: 'In treatment',
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
  CANCELLED: 'Cancelled',
};

/** Section headings, in the order the board renders them. */
export const FLOW_SECTIONS: readonly { group: FlowGroup; title: string; hint: string }[] = [
  { group: 'IN_TREATMENT', title: 'With the doctor', hint: 'Currently in the chair' },
  { group: 'WAITING', title: 'Waiting now', hint: 'In the clinic, waiting to be seen' },
  { group: 'ARRIVED', title: 'Just arrived', hint: 'Checked in, not yet in the waiting room' },
  { group: 'LATE', title: 'Late', hint: 'Slot has started, patient has not checked in' },
  { group: 'UPCOMING', title: 'Next patients', hint: 'Expected later today' },
  { group: 'COMPLETED', title: 'Completed', hint: 'Seen and finished' },
  { group: 'CLOSED', title: 'No-shows and cancellations', hint: 'Kept for the record' },
];

/**
 * The one action a row is asking for right now.
 *
 * Deliberately a single primary action per status: a row offering five buttons
 * makes the receptionist choose instead of act. Secondary actions live in the
 * detail drawer.
 */
export interface RowAction {
  label: string;
  /** Status to transition to. */
  next: AppointmentStatus;
  variant: 'primary' | 'quiet';
}

export function primaryAction(row: ReceptionRow): RowAction | null {
  switch (row.status) {
    case 'SCHEDULED':
    case 'CONFIRMED':
      return { label: 'Patient arrived', next: 'ARRIVED', variant: 'primary' };
    case 'ARRIVED':
      return { label: 'Move to waiting', next: 'WAITING', variant: 'primary' };
    case 'WAITING':
      return { label: 'Start visit', next: 'IN_TREATMENT', variant: 'primary' };
    case 'IN_TREATMENT':
      return { label: 'Complete visit', next: 'COMPLETED', variant: 'primary' };
    default:
      // COMPLETED, NO_SHOW and CANCELLED are read-only on the board.
      return null;
  }
}

/**
 * Marking a no-show is offered only once someone is actually late, and never
 * automatically — the clinic decides, the clock only prompts.
 */
export function canMarkNoShow(row: ReceptionRow): boolean {
  return row.flowGroup === 'LATE';
}

/** Whole minutes between an ISO timestamp and now. Never negative. */
export function minutesSince(iso: string | null, now: number): number | null {
  if (!iso) {
    return null;
  }
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

/** `18 min`, `1 h 04`. Short enough to sit inside a dense row. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) {
    return '—';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

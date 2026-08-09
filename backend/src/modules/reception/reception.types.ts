import type { AppointmentStatus } from '../appointments/appointment.types.js';

/**
 * The reception board — today's clinic flow.
 *
 * This module owns NO data and defines NO new statuses. The appointment
 * lifecycle already models everything reception needs (SCHEDULED → CONFIRMED →
 * ARRIVED → WAITING → IN_TREATMENT → COMPLETED, plus NO_SHOW and CANCELLED),
 * and every transition already has an endpoint. What was missing was a read
 * model: a way to ask "what is happening in the clinic right now?" without
 * downloading a month of appointments and grouping them in the browser.
 *
 * LATE IS NOT A STATUS. It is derived — an appointment still SCHEDULED or
 * CONFIRMED whose start time has passed. Persisting it would mean a background
 * job mutating clinical records on a timer, and a patient who walks in five
 * minutes later would leave a false "late" flag behind them forever.
 */

/** Which operational bucket a row belongs to. Derived, never stored. */
export const FLOW_GROUPS = {
  IN_TREATMENT: 'IN_TREATMENT',
  WAITING: 'WAITING',
  ARRIVED: 'ARRIVED',
  LATE: 'LATE',
  UPCOMING: 'UPCOMING',
  COMPLETED: 'COMPLETED',
  /** No-shows and cancellations: visible history, no further action. */
  CLOSED: 'CLOSED',
} as const;

export type FlowGroup = (typeof FLOW_GROUPS)[keyof typeof FLOW_GROUPS];

/**
 * Operational priority, highest first.
 *
 * Deliberately not "sort by appointment time": at 10:20 the person in the chair
 * and the person who has been waiting 25 minutes matter more than the 10:15
 * booking who has not walked in. Time still orders rows *within* a group.
 */
export const FLOW_GROUP_ORDER: readonly FlowGroup[] = [
  FLOW_GROUPS.IN_TREATMENT,
  FLOW_GROUPS.WAITING,
  FLOW_GROUPS.ARRIVED,
  FLOW_GROUPS.LATE,
  FLOW_GROUPS.UPCOMING,
  FLOW_GROUPS.COMPLETED,
  FLOW_GROUPS.CLOSED,
];

/**
 * Places an appointment in its bucket.
 *
 * Pure and total so the board, the counters and the frontend cannot disagree
 * about where a patient belongs.
 */
export function resolveFlowGroup(
  status: AppointmentStatus,
  startAt: Date,
  now: Date,
): FlowGroup {
  switch (status) {
    case 'IN_TREATMENT':
      return FLOW_GROUPS.IN_TREATMENT;
    case 'WAITING':
      return FLOW_GROUPS.WAITING;
    case 'ARRIVED':
      return FLOW_GROUPS.ARRIVED;
    case 'COMPLETED':
      return FLOW_GROUPS.COMPLETED;
    case 'NO_SHOW':
    case 'CANCELLED':
      return FLOW_GROUPS.CLOSED;
    default:
      // SCHEDULED or CONFIRMED: late only once the slot has actually started.
      return startAt.getTime() < now.getTime() ? FLOW_GROUPS.LATE : FLOW_GROUPS.UPCOMING;
  }
}

/** Whole minutes elapsed, floored, never negative. */
export function minutesSince(from: Date | null, now: Date): number | null {
  if (!from) {
    return null;
  }
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
}

/**
 * One row of the board.
 *
 * Durations are NOT included: the server sends the timestamps and the client
 * derives "waiting 12 min" from them, so the number ticks up without a request
 * every minute. See AGENTS.md §25 on not persisting derived values.
 */
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
  /** Minutes past the scheduled start, when the patient has not arrived. */
  lateByMinutes: number | null;

  arrivedAt: string | null;
  waitingSince: string | null;
  treatmentStartedAt: string | null;
  completedAt: string | null;
  noShowAt: string | null;

  note: string | null;
  cancellationReason: string | null;
}

/** Compact counters for the header strip. */
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
  /** The clinic's calendar date, `YYYY-MM-DD`, in its own timezone. */
  date: string;
  timezone: string;
  /** Server time when the board was built, so the client can align its clock. */
  generatedAt: string;
  summary: ReceptionSummary;
  rows: ReceptionRow[];
}

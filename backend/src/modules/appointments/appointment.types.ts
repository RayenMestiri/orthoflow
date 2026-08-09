import type { Types } from 'mongoose';
import type { ClinicRole } from '../../common/constants/roles.js';

/**
 * The operational life of a visit, from booking to outcome.
 *
 * These are the words the front desk actually uses during a clinic day, which
 * is why they are statuses rather than booleans scattered across the document.
 */
export const APPOINTMENT_STATUSES = {
  /** Booked, not yet acknowledged by the patient. */
  SCHEDULED: 'SCHEDULED',
  /** Patient confirmed they are coming. */
  CONFIRMED: 'CONFIRMED',
  /** Patient is physically in the clinic. */
  ARRIVED: 'ARRIVED',
  /** Checked in and sitting in the waiting room. */
  WAITING: 'WAITING',
  /** In the chair with the doctor. */
  IN_TREATMENT: 'IN_TREATMENT',
  /** Seen and finished. Terminal. */
  COMPLETED: 'COMPLETED',
  /** Never turned up. Terminal, and kept for analytics. */
  NO_SHOW: 'NO_SHOW',
  /** Called off. Terminal, never deleted. */
  CANCELLED: 'CANCELLED',
} as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[keyof typeof APPOINTMENT_STATUSES];

export const APPOINTMENT_STATUS_VALUES = Object.values(APPOINTMENT_STATUSES) as [
  AppointmentStatus,
  ...AppointmentStatus[],
];

/**
 * Allowed status moves.
 *
 * The happy path is SCHEDULED → CONFIRMED → ARRIVED → WAITING → IN_TREATMENT →
 * COMPLETED, but a real clinic skips steps constantly (a patient walks straight
 * into the chair), so forward jumps are permitted. What is *not* permitted is
 * going backwards, or leaving a terminal state — an appointment that already
 * happened cannot become "scheduled" again.
 *
 * NO_SHOW is deliberately unreachable once the patient has arrived.
 */
export const APPOINTMENT_STATUS_TRANSITIONS: Readonly<
  Record<AppointmentStatus, readonly AppointmentStatus[]>
> = {
  [APPOINTMENT_STATUSES.SCHEDULED]: [
    APPOINTMENT_STATUSES.CONFIRMED,
    APPOINTMENT_STATUSES.ARRIVED,
    APPOINTMENT_STATUSES.WAITING,
    APPOINTMENT_STATUSES.IN_TREATMENT,
    APPOINTMENT_STATUSES.COMPLETED,
    APPOINTMENT_STATUSES.NO_SHOW,
    APPOINTMENT_STATUSES.CANCELLED,
  ],
  [APPOINTMENT_STATUSES.CONFIRMED]: [
    APPOINTMENT_STATUSES.ARRIVED,
    APPOINTMENT_STATUSES.WAITING,
    APPOINTMENT_STATUSES.IN_TREATMENT,
    APPOINTMENT_STATUSES.COMPLETED,
    APPOINTMENT_STATUSES.NO_SHOW,
    APPOINTMENT_STATUSES.CANCELLED,
  ],
  [APPOINTMENT_STATUSES.ARRIVED]: [
    APPOINTMENT_STATUSES.WAITING,
    APPOINTMENT_STATUSES.IN_TREATMENT,
    APPOINTMENT_STATUSES.COMPLETED,
    APPOINTMENT_STATUSES.CANCELLED,
  ],
  [APPOINTMENT_STATUSES.WAITING]: [
    APPOINTMENT_STATUSES.IN_TREATMENT,
    APPOINTMENT_STATUSES.COMPLETED,
    APPOINTMENT_STATUSES.CANCELLED,
  ],
  [APPOINTMENT_STATUSES.IN_TREATMENT]: [
    APPOINTMENT_STATUSES.COMPLETED,
    APPOINTMENT_STATUSES.CANCELLED,
  ],
  [APPOINTMENT_STATUSES.COMPLETED]: [],
  [APPOINTMENT_STATUSES.NO_SHOW]: [],
  [APPOINTMENT_STATUSES.CANCELLED]: [],
};

/** Terminal states. The visit is over; time and patient may no longer change. */
export const CLOSED_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  APPOINTMENT_STATUSES.COMPLETED,
  APPOINTMENT_STATUSES.NO_SHOW,
  APPOINTMENT_STATUSES.CANCELLED,
];

/**
 * Statuses that still occupy the doctor's time.
 *
 * A cancelled or missed slot is free again, so it must not block a rebooking —
 * this is the list the overlap check runs against.
 */
export const CAPACITY_CONSUMING_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  APPOINTMENT_STATUSES.SCHEDULED,
  APPOINTMENT_STATUSES.CONFIRMED,
  APPOINTMENT_STATUSES.ARRIVED,
  APPOINTMENT_STATUSES.WAITING,
  APPOINTMENT_STATUSES.IN_TREATMENT,
];

export function isClosedStatus(status: AppointmentStatus): boolean {
  return CLOSED_APPOINTMENT_STATUSES.includes(status);
}

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return APPOINTMENT_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * A booked visit.
 *
 * `startAt`/`endAt` are absolute instants stored in UTC; the clinic timezone
 * turns them back into wall-clock time for display and for working-hours checks.
 * `durationMinutes` is derived from the two and stored for reporting, never
 * trusted as an independent source of truth.
 *
 * MVP RULE — ONE CLINIC = ONE OWNER-DOCTOR. `doctorId` is always resolved from
 * the clinic on the server. It exists as a field so multi-practitioner
 * scheduling can arrive later without a migration, but nothing accepts it from
 * a client today.
 */
export interface AppointmentAttributes {
  /** Tenant key. Present in every single query against this collection. */
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  appointmentTypeId: Types.ObjectId;

  startAt: Date;
  endAt: Date;
  durationMinutes: number;

  status: AppointmentStatus;
  note: string | null;

  cancellationReason: string | null;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;

  arrivedAt: Date | null;
  treatmentStartedAt: Date | null;
  completedAt: Date | null;
  noShowAt: Date | null;
  markedNoShowBy: Types.ObjectId | null;
  overbookingOverride: boolean;
  overbookingApprovedBy: Types.ObjectId | null;

  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AppointmentRecord = AppointmentAttributes & { _id: Types.ObjectId };

export interface CreateAppointmentInput {
  clinicId: string;
  patientId: string;
  doctorId: string;
  appointmentTypeId: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  status?: AppointmentStatus;
  note?: string | null;
  overbookingOverride?: boolean;
  overbookingApprovedBy?: string | null;
  createdBy: string;
}

export interface UpdateAppointmentFields {
  patientId?: string;
  appointmentTypeId?: string;
  startAt?: Date;
  endAt?: Date;
  durationMinutes?: number;
  note?: string | null;
  overbookingOverride?: boolean;
  overbookingApprovedBy?: string | null;
  updatedBy: string;
}

export interface AppointmentRangeQuery {
  /** Inclusive lower bound on `startAt`. */
  start: Date;
  /** Exclusive upper bound on `startAt`. */
  end: Date;
  status?: AppointmentStatus;
  patientId?: string;
}

export interface AppointmentPatientSummary {
  id: string;
  fullName: string;
  phone: string | null;
  age: number | null;
}

export interface AppointmentTypeSummary {
  id: string;
  name: string;
  color: string | null;
  durationMinutes: number;
}

export type SlotCapacityState = 'AVAILABLE' | 'BUSY' | 'AT_CAPACITY' | 'OVERBOOKED';

export interface SlotCapacityInfo {
  state: SlotCapacityState;
  concurrentAppointments: number;
  recommendedCapacity: number;
  overbookingOverride: boolean;
}

export interface AppointmentActivityDto {
  id: string;
  action: string;
  actorUserId: string | null;
  actorName: string;
  /** Clinic role at read time, so a timeline can say "Sarah · Secretary". */
  actorRole: ClinicRole | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * What the calendar renders.
 *
 * Patient and type details are joined at read time rather than copied into the
 * appointment document: a corrected patient name must not leave stale copies
 * scattered across a year of past visits.
 */
export interface AppointmentDto {
  id: string;
  clinicId: string;
  patientId: string;
  doctorId: string;
  appointmentTypeId: string;

  startAt: string;
  endAt: string;
  durationMinutes: number;

  status: AppointmentStatus;
  note: string | null;

  cancellationReason: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  arrivedAt: string | null;
  treatmentStartedAt: string | null;
  completedAt: string | null;
  noShowAt: string | null;
  markedNoShowBy: string | null;
  overbookingOverride: boolean;
  overbookingApprovedBy: string | null;

  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;

  patient: AppointmentPatientSummary | null;
  appointmentType: AppointmentTypeSummary | null;
  slotCapacity: SlotCapacityInfo;
}

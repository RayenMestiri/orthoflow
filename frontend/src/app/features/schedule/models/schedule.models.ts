/**
 * Scheduling domain models — mirrors of the backend DTOs.
 *
 * Statuses live here once; components import from this module instead of
 * scattering status strings through templates.
 */
import type {
  ClinicSchedulingSettings,
  WeeklyWorkingHours,
} from '../../settings/models/clinic-settings.models';

export const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'ARRIVED',
  'WAITING',
  'IN_TREATMENT',
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED',
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Statuses that end an appointment's life. No edits, no further transitions. */
export const CLOSED_STATUSES: readonly AppointmentStatus[] = ['COMPLETED', 'NO_SHOW', 'CANCELLED'];

/**
 * Client-side copy of the backend transition table, used only to decide which
 * action buttons to render. The backend re-validates every transition.
 */
export const STATUS_TRANSITIONS: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> =
  {
    SCHEDULED: [
      'CONFIRMED',
      'ARRIVED',
      'WAITING',
      'IN_TREATMENT',
      'COMPLETED',
      'NO_SHOW',
      'CANCELLED',
    ],
    CONFIRMED: ['ARRIVED', 'WAITING', 'IN_TREATMENT', 'COMPLETED', 'NO_SHOW', 'CANCELLED'],
    ARRIVED: ['WAITING', 'IN_TREATMENT', 'COMPLETED', 'CANCELLED'],
    WAITING: ['IN_TREATMENT', 'COMPLETED', 'CANCELLED'],
    IN_TREATMENT: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    NO_SHOW: [],
    CANCELLED: [],
  };

export const STATUS_LABELS: Readonly<Record<AppointmentStatus, string>> = {
  SCHEDULED: 'Scheduled',
  CONFIRMED: 'Confirmed',
  ARRIVED: 'Arrived',
  WAITING: 'Waiting',
  IN_TREATMENT: 'In treatment',
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
  CANCELLED: 'Cancelled',
};

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

export interface Appointment {
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

export interface AppointmentType {
  id: string;
  clinicId: string;
  name: string;
  durationMinutes: number;
  color: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicScheduleConfiguration {
  timezone: string;
  workingHours: WeeklyWorkingHours;
  scheduling: ClinicSchedulingSettings;
}

export interface CreateAppointmentInput {
  patientId: string;
  appointmentTypeId: string;
  /** ISO UTC instant. */
  startAt: string;
  durationMinutes?: number;
  note?: string | null;
  allowOverbooking?: boolean;
}

export interface UpdateAppointmentInput {
  patientId?: string;
  appointmentTypeId?: string;
  startAt?: string;
  durationMinutes?: number;
  note?: string | null;
  allowOverbooking?: boolean;
}

export interface CapacityWarningAppointment {
  id: string;
  patientName: string;
  startAt: string;
  endAt: string;
}

export interface CapacityWarning {
  requiresConfirmation: true;
  recommendedCapacity: number;
  concurrentAppointments: number;
  resultingAppointments: number;
  state: SlotCapacityState;
  overrideAllowed: boolean;
  overlappingAppointments: CapacityWarningAppointment[];
}

export interface AppointmentActivity {
  id: string;
  action: string;
  actorUserId: string | null;
  actorName: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type CalendarViewName = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth';

export interface VisibleRange {
  /** ISO instants covering what the calendar currently shows. */
  start: string;
  end: string;
  /** Human title from the calendar, e.g. "Aug 10 – 16, 2026". */
  title: string;
}

/** A slot the user picked on the grid, seeding the create drawer. */
export interface DraftSlot {
  startAt: string;
  /** Present when the user dragged a range instead of clicking one slot. */
  endAt: string | null;
}

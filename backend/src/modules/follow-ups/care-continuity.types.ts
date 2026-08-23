import type { Types } from 'mongoose';

export const CARE_CONTINUITY_STATES = {
  NEEDS_ATTENTION: 'NEEDS_ATTENTION',
  LOST_TO_FOLLOW_UP: 'LOST_TO_FOLLOW_UP',
} as const;
export type CareContinuityState =
  (typeof CARE_CONTINUITY_STATES)[keyof typeof CARE_CONTINUITY_STATES];
export const CARE_CONTINUITY_STATE_VALUES = Object.values(CARE_CONTINUITY_STATES) as [
  CareContinuityState,
  ...CareContinuityState[],
];

export const CARE_CONTINUITY_REASONS = {
  NO_RECENT_VISIT: 'NO_RECENT_VISIT',
  NO_FUTURE_APPOINTMENT: 'NO_FUTURE_APPOINTMENT',
  RETENTION_CONTROL_OVERDUE: 'RETENTION_CONTROL_OVERDUE',
  MISSED_NOT_REBOOKED: 'MISSED_NOT_REBOOKED',
} as const;
export type CareContinuityReason =
  (typeof CARE_CONTINUITY_REASONS)[keyof typeof CARE_CONTINUITY_REASONS];
export const CARE_CONTINUITY_REASON_VALUES = Object.values(CARE_CONTINUITY_REASONS) as [
  CareContinuityReason,
  ...CareContinuityReason[],
];

export interface CareContinuityAggregateRow {
  patientId: Types.ObjectId;
  patientFirstName: string;
  patientLastName: string;
  patientPhone: string | null;
  careType: 'TREATMENT' | 'RETENTION';
  treatmentId: Types.ObjectId;
  retentionPlanId: Types.ObjectId | null;
  treatmentType: string;
  treatmentCustomLabel: string | null;
  state: CareContinuityState;
  reasons: CareContinuityReason[];
  lastClinicalAt: Date;
  daysWithoutVisit: number;
  recommendedAt: Date | null;
  missedAppointmentId: Types.ObjectId | null;
  missedAppointmentAt: Date | null;
  missedAppointmentStatus: string | null;
}

export interface CareContinuityRow {
  patient: { id: string; fullName: string; phone: string | null };
  context: {
    type: 'TREATMENT' | 'RETENTION';
    treatment: { id: string; label: string };
    retentionPlanId: string | null;
  };
  state: CareContinuityState;
  reasons: CareContinuityReason[];
  lastClinicalAt: string;
  daysWithoutVisit: number;
  recommendedAt: string | null;
  missedAppointment: { id: string; startAt: string; status: string } | null;
}

export interface CareContinuityQuery {
  state?: CareContinuityState;
  search?: string;
}

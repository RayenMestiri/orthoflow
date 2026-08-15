import { clinicCalendarDayDifference } from '../../common/utils/clinic-time.js';
import { APPOINTMENT_STATUSES, type AppointmentStatus } from '../appointments/appointment.types.js';
import { FOLLOW_UP_STATES, type FollowUpState } from './follow-up.types.js';

export const DUE_SOON_DAYS = 7;
export const NON_QUALIFYING_FOLLOW_UP_STATUSES: readonly AppointmentStatus[] = [
  APPOINTMENT_STATUSES.CANCELLED,
  APPOINTMENT_STATUSES.NO_SHOW,
];

export function appointmentQualifiesForRecommendation(input: {
  patientId: string;
  treatmentId: string | null;
  startAt: Date;
  status: AppointmentStatus;
  recommendationPatientId: string;
  recommendationTreatmentId: string | null;
  now: Date;
}): boolean {
  return (
    input.patientId === input.recommendationPatientId &&
    input.treatmentId === input.recommendationTreatmentId &&
    input.startAt.getTime() >= input.now.getTime() &&
    !NON_QUALIFYING_FOLLOW_UP_STATUSES.includes(input.status)
  );
}

export function deriveFollowUpState(
  recommendedAt: Date,
  hasQualifyingAppointment: boolean,
  timezone: string,
  now: Date,
): { state: FollowUpState; daysFromRecommendation: number } {
  const daysFromRecommendation = clinicCalendarDayDifference(recommendedAt, now, timezone);
  const state = hasQualifyingAppointment
    ? FOLLOW_UP_STATES.SCHEDULED
    : daysFromRecommendation > 0
      ? FOLLOW_UP_STATES.OVERDUE
      : daysFromRecommendation >= -DUE_SOON_DAYS
        ? FOLLOW_UP_STATES.DUE_SOON
        : FOLLOW_UP_STATES.NEEDS_SCHEDULING;
  return { state, daysFromRecommendation };
}

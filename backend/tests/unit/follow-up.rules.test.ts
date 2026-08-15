import { describe, expect, it } from 'vitest';
import { APPOINTMENT_STATUSES } from '../../src/modules/appointments/appointment.types.js';
import {
  appointmentQualifiesForRecommendation,
  deriveFollowUpState,
} from '../../src/modules/follow-ups/follow-up.rules.js';

const now = new Date('2026-08-15T10:00:00.000Z');

describe('follow-up rules', () => {
  it('keeps a recommendation without an appointment in the scheduling queue', () => {
    expect(
      deriveFollowUpState(new Date('2026-08-20T12:00:00.000Z'), false, 'Africa/Lagos', now),
    ).toEqual({ state: 'DUE_SOON', daysFromRecommendation: -5 });
  });

  it('resolves a recommendation only with a future active appointment', () => {
    const common = {
      patientId: 'patient-a',
      treatmentId: 'treatment-a',
      startAt: new Date('2026-08-20T09:00:00.000Z'),
      recommendationPatientId: 'patient-a',
      recommendationTreatmentId: 'treatment-a',
      now,
    };
    expect(
      appointmentQualifiesForRecommendation({ ...common, status: APPOINTMENT_STATUSES.SCHEDULED }),
    ).toBe(true);
    expect(
      appointmentQualifiesForRecommendation({ ...common, status: APPOINTMENT_STATUSES.CANCELLED }),
    ).toBe(false);
    expect(
      appointmentQualifiesForRecommendation({ ...common, status: APPOINTMENT_STATUSES.NO_SHOW }),
    ).toBe(false);
    expect(
      appointmentQualifiesForRecommendation({
        ...common,
        status: APPOINTMENT_STATUSES.SCHEDULED,
        startAt: new Date('2026-08-14T09:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('keeps treatment follow-ups and general consultations in separate contexts', () => {
    const base = {
      patientId: 'patient-a',
      startAt: new Date('2026-08-20T09:00:00.000Z'),
      status: APPOINTMENT_STATUSES.SCHEDULED,
      recommendationPatientId: 'patient-a',
      now,
    };
    expect(
      appointmentQualifiesForRecommendation({
        ...base,
        treatmentId: 'treatment-a',
        recommendationTreatmentId: 'treatment-a',
      }),
    ).toBe(true);
    expect(
      appointmentQualifiesForRecommendation({
        ...base,
        treatmentId: 'treatment-b',
        recommendationTreatmentId: 'treatment-a',
      }),
    ).toBe(false);
    expect(
      appointmentQualifiesForRecommendation({
        ...base,
        treatmentId: null,
        recommendationTreatmentId: null,
      }),
    ).toBe(true);
  });

  it('derives overdue from the clinic calendar, not UTC midnight', () => {
    const recommendation = new Date('2026-08-15T08:00:00.000Z');
    const boundary = new Date('2026-08-15T23:30:00.000Z');
    expect(deriveFollowUpState(recommendation, false, 'Africa/Lagos', boundary).state).toBe(
      'OVERDUE',
    );
    expect(deriveFollowUpState(recommendation, false, 'America/Los_Angeles', boundary).state).toBe(
      'DUE_SOON',
    );
  });

  it('marks any qualifying rescheduled appointment as scheduled', () => {
    expect(
      deriveFollowUpState(new Date('2026-08-10T12:00:00.000Z'), true, 'Africa/Lagos', now).state,
    ).toBe('SCHEDULED');
  });
});

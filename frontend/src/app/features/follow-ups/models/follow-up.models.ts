export type FollowUpState = 'SCHEDULED' | 'NEEDS_SCHEDULING' | 'DUE_SOON' | 'OVERDUE';
export type FollowUpFilter = 'ALL' | FollowUpState;
export type FollowUpSort =
  'MOST_OVERDUE' | 'RECOMMENDATION_DATE' | 'PATIENT_NAME' | 'RECENTLY_VISITED';

export interface FollowUpRow {
  patient: { id: string; fullName: string; phone: string | null };
  treatment: { id: string; label: string; status: string } | null;
  retentionPlanId?: string | null;
  sourceVisit: { id: string; startedAt: string; completedAt: string } | null;
  sourceRetentionPlan?: { id: string; createdAt: string } | null;
  recommendedAt: string;
  appointment: {
    id: string;
    startAt: string;
    endAt: string;
    status: string;
    appointmentType: string | null;
  } | null;
  state: FollowUpState;
  daysFromRecommendation: number;
}

export type CareContinuityState = 'NEEDS_ATTENTION' | 'LOST_TO_FOLLOW_UP';
export type CareContinuityReason =
  | 'NO_RECENT_VISIT'
  | 'NO_FUTURE_APPOINTMENT'
  | 'RETENTION_CONTROL_OVERDUE'
  | 'MISSED_NOT_REBOOKED';

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

export interface CareContinuityResult {
  summary: { needsAttention: number; lostToFollowUp: number };
  rows: CareContinuityRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface FollowUpResult {
  summary: { needsScheduling: number; overdue: number; scheduled: number };
  rows: FollowUpRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export type FollowUpState = 'SCHEDULED' | 'NEEDS_SCHEDULING' | 'DUE_SOON' | 'OVERDUE';
export type FollowUpFilter = 'ALL' | FollowUpState;
export type FollowUpSort =
  'MOST_OVERDUE' | 'RECOMMENDATION_DATE' | 'PATIENT_NAME' | 'RECENTLY_VISITED';

export interface FollowUpRow {
  patient: { id: string; fullName: string; phone: string | null };
  treatment: { id: string; label: string; status: string } | null;
  sourceVisit: { id: string; startedAt: string; completedAt: string };
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

export interface FollowUpResult {
  summary: { needsScheduling: number; overdue: number; scheduled: number };
  rows: FollowUpRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

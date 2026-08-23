export const FOLLOW_UP_STATES = {
  SCHEDULED: 'SCHEDULED',
  NEEDS_SCHEDULING: 'NEEDS_SCHEDULING',
  DUE_SOON: 'DUE_SOON',
  OVERDUE: 'OVERDUE',
} as const;
export type FollowUpState = (typeof FOLLOW_UP_STATES)[keyof typeof FOLLOW_UP_STATES];
export const FOLLOW_UP_STATE_VALUES = Object.values(FOLLOW_UP_STATES) as [
  FollowUpState,
  ...FollowUpState[],
];

export const FOLLOW_UP_FILTERS = { ALL: 'ALL', ...FOLLOW_UP_STATES } as const;
export const FOLLOW_UP_FILTER_VALUES = Object.values(FOLLOW_UP_FILTERS) as [
  (typeof FOLLOW_UP_FILTERS)[keyof typeof FOLLOW_UP_FILTERS],
  ...(typeof FOLLOW_UP_FILTERS)[keyof typeof FOLLOW_UP_FILTERS][],
];

export const FOLLOW_UP_SORTS = {
  MOST_OVERDUE: 'MOST_OVERDUE',
  RECOMMENDATION_DATE: 'RECOMMENDATION_DATE',
  PATIENT_NAME: 'PATIENT_NAME',
  RECENTLY_VISITED: 'RECENTLY_VISITED',
} as const;
export const FOLLOW_UP_SORT_VALUES = Object.values(FOLLOW_UP_SORTS) as [
  (typeof FOLLOW_UP_SORTS)[keyof typeof FOLLOW_UP_SORTS],
  ...(typeof FOLLOW_UP_SORTS)[keyof typeof FOLLOW_UP_SORTS][],
];

export interface FollowUpSummary {
  needsScheduling: number;
  overdue: number;
  scheduled: number;
}

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

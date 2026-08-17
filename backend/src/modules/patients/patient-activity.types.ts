import type { ClinicRole } from '../../common/constants/roles.js';

export const PATIENT_ACTIVITY_FILTERS = {
  ALL: 'ALL',
  CLINICAL: 'CLINICAL',
  APPOINTMENTS: 'APPOINTMENTS',
  PAYMENTS: 'PAYMENTS',
  DOCUMENTS: 'DOCUMENTS',
} as const;

export type PatientActivityFilter =
  (typeof PATIENT_ACTIVITY_FILTERS)[keyof typeof PATIENT_ACTIVITY_FILTERS];

export const PATIENT_ACTIVITY_FILTER_VALUES = Object.values(PATIENT_ACTIVITY_FILTERS) as [
  PatientActivityFilter,
  ...PatientActivityFilter[],
];

export const PATIENT_ACTIVITY_TYPES = {
  APPOINTMENT_SCHEDULED: 'APPOINTMENT_SCHEDULED',
  APPOINTMENT_RESCHEDULED: 'APPOINTMENT_RESCHEDULED',
  PATIENT_ARRIVED: 'PATIENT_ARRIVED',
  PATIENT_WAITING: 'PATIENT_WAITING',
  VISIT_STARTED: 'VISIT_STARTED',
  APPOINTMENT_COMPLETED: 'APPOINTMENT_COMPLETED',
  APPOINTMENT_NO_SHOW: 'APPOINTMENT_NO_SHOW',
  APPOINTMENT_CANCELLED: 'APPOINTMENT_CANCELLED',
  TREATMENT_CREATED: 'TREATMENT_CREATED',
  TREATMENT_STARTED: 'TREATMENT_STARTED',
  TREATMENT_PAUSED: 'TREATMENT_PAUSED',
  TREATMENT_RESUMED: 'TREATMENT_RESUMED',
  TREATMENT_COMPLETED: 'TREATMENT_COMPLETED',
  TREATMENT_CANCELLED: 'TREATMENT_CANCELLED',
  CLINICAL_VISIT_COMPLETED: 'CLINICAL_VISIT_COMPLETED',
  CLINICAL_VISIT_AMENDED: 'CLINICAL_VISIT_AMENDED',
  FOLLOW_UP_RECOMMENDED: 'FOLLOW_UP_RECOMMENDED',
  PAYMENT_RECORDED: 'PAYMENT_RECORDED',
  PAYMENT_CORRECTED: 'PAYMENT_CORRECTED',
  PAYMENT_CANCELLED: 'PAYMENT_CANCELLED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_ARCHIVED: 'DOCUMENT_ARCHIVED',
  DOCUMENT_RESTORED: 'DOCUMENT_RESTORED',
} as const;

export type PatientActivityType =
  (typeof PATIENT_ACTIVITY_TYPES)[keyof typeof PATIENT_ACTIVITY_TYPES];

export const PATIENT_ACTIVITY_TYPE_VALUES = Object.values(PATIENT_ACTIVITY_TYPES) as [
  PatientActivityType,
  ...PatientActivityType[],
];

export const PATIENT_ACTIVITY_TARGETS = {
  APPOINTMENT: 'APPOINTMENT',
  TREATMENT: 'TREATMENT',
  CLINICAL_VISIT: 'CLINICAL_VISIT',
  CASH_RECORD: 'CASH_RECORD',
  MEDIA: 'MEDIA',
} as const;

export type PatientActivityTargetType =
  (typeof PATIENT_ACTIVITY_TARGETS)[keyof typeof PATIENT_ACTIVITY_TARGETS];

export const PATIENT_ACTIVITY_TARGET_VALUES = Object.values(PATIENT_ACTIVITY_TARGETS) as [
  PatientActivityTargetType,
  ...PatientActivityTargetType[],
];

export interface PatientActivityDto {
  id: string;
  type: PatientActivityType;
  occurredAt: string;
  title: string;
  subtitle: string | null;
  detail: string | null;
  actor: { displayName: string; role: ClinicRole | null } | null;
  treatment: { id: string; label: string } | null;
  appointmentId: string | null;
  clinicalVisitId: string | null;
  cashRecordId: string | null;
  receiptId: string | null;
  mediaId: string | null;
  amountMinor: number | null;
  currency: string | null;
  receiptNumber: string | null;
  scheduledAt: string | null;
  recommendedAt: string | null;
  cancellationReason: string | null;
  targetType: PatientActivityTargetType | null;
  targetId: string | null;
}

export interface PatientActivityVisibility {
  appointments: boolean;
  clinical: boolean;
  clinicalDetails: boolean;
  followUps: boolean;
  payments: boolean;
  documents: boolean;
}

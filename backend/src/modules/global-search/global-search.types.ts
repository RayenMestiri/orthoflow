export const GLOBAL_SEARCH_RESULT_TYPES = {
  PATIENT: 'PATIENT',
  RECEIPT: 'RECEIPT',
  TREATMENT: 'TREATMENT',
  APPOINTMENT: 'APPOINTMENT',
  DOCUMENT: 'DOCUMENT',
} as const;

export type GlobalSearchResultType =
  (typeof GLOBAL_SEARCH_RESULT_TYPES)[keyof typeof GLOBAL_SEARCH_RESULT_TYPES];

export const GLOBAL_SEARCH_TARGETS = {
  PATIENT_PROFILE: 'PATIENT_PROFILE',
  RECEIPT_DETAIL: 'RECEIPT_DETAIL',
  TREATMENT_DETAIL: 'TREATMENT_DETAIL',
  APPOINTMENT_DETAIL: 'APPOINTMENT_DETAIL',
  DOCUMENT_VIEWER: 'DOCUMENT_VIEWER',
} as const;

export type GlobalSearchTarget =
  (typeof GLOBAL_SEARCH_TARGETS)[keyof typeof GLOBAL_SEARCH_TARGETS];

export const GLOBAL_SEARCH_CATEGORIES = {
  PATIENTS: 'PATIENTS',
  RECEIPTS: 'RECEIPTS',
  TREATMENTS: 'TREATMENTS',
  APPOINTMENTS: 'APPOINTMENTS',
  DOCUMENTS: 'DOCUMENTS',
} as const;

export type GlobalSearchCategory =
  (typeof GLOBAL_SEARCH_CATEGORIES)[keyof typeof GLOBAL_SEARCH_CATEGORIES];

export interface GlobalSearchResultItemDto {
  id: string;
  type: GlobalSearchResultType;
  title: string;
  subtitle: string | null;
  badge: string | null;
  meta: string | null;
  patientId: string | null;
  patientName: string | null;
  targetId: string;
  target: GlobalSearchTarget;
  route: string[];
  queryParams: Record<string, string> | null;
}

export interface GlobalSearchGroupDto {
  category: GlobalSearchCategory;
  label: string;
  items: GlobalSearchResultItemDto[];
}

export interface GlobalSearchResponseDto {
  query: string;
  totalMatches: number;
  groups: GlobalSearchGroupDto[];
}

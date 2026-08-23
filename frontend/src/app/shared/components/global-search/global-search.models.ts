export type GlobalSearchResultType =
  | 'PATIENT'
  | 'RECEIPT'
  | 'TREATMENT'
  | 'APPOINTMENT'
  | 'DOCUMENT';

export type GlobalSearchTarget =
  | 'PATIENT_PROFILE'
  | 'RECEIPT_DETAIL'
  | 'TREATMENT_DETAIL'
  | 'APPOINTMENT_DETAIL'
  | 'DOCUMENT_VIEWER';

export type GlobalSearchCategory =
  | 'PATIENTS'
  | 'RECEIPTS'
  | 'TREATMENTS'
  | 'APPOINTMENTS'
  | 'DOCUMENTS';

export interface GlobalSearchResultItem {
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

export interface GlobalSearchGroup {
  category: GlobalSearchCategory;
  label: string;
  items: GlobalSearchResultItem[];
}

export interface GlobalSearchResponse {
  query: string;
  totalMatches: number;
  groups: GlobalSearchGroup[];
}

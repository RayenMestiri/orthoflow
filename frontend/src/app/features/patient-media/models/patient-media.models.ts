export const PATIENT_MEDIA_CATEGORIES = [
  'PROFILE_PHOTO',
  'EXTRAORAL_PHOTO',
  'INTRAORAL_PHOTO',
  'PROGRESS_PHOTO',
  'XRAY',
  'SCAN',
  'PRESCRIPTION',
  'CONSENT',
  'REFERRAL',
  'REPORT',
  'ADMINISTRATIVE',
  'OTHER',
] as const;

export type PatientMediaCategory = (typeof PATIENT_MEDIA_CATEGORIES)[number];
export type PatientMediaType = 'IMAGE' | 'PDF' | 'DOCUMENT';
export type PatientMediaStatus = 'ACTIVE' | 'ARCHIVED';

export interface PatientMedia {
  id: string;
  clinicId: string;
  patientId: string;
  treatmentId: string | null;
  category: PatientMediaCategory;
  mediaType: PatientMediaType;
  title: string;
  description: string | null;
  storageProvider: string;
  contentUrl: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  format: string | null;
  width: number | null;
  height: number | null;
  capturedAt: string | null;
  uploadedAt: string;
  uploadedByUserId: string;
  status: PatientMediaStatus;
  archivedAt: string | null;
  archivedByUserId: string | null;
  archiveReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientMediaFilters {
  category?: PatientMediaCategory;
  mediaType?: PatientMediaType;
  status?: PatientMediaStatus;
  treatmentId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PatientMediaUploadInput {
  file: File;
  category: PatientMediaCategory;
  title: string;
  description?: string | null;
  treatmentId?: string | null;
  capturedAt?: string | null;
}

export interface UpdatePatientMediaInput {
  category?: PatientMediaCategory;
  title?: string;
  description?: string | null;
  treatmentId?: string | null;
  capturedAt?: string | null;
}

export type PatientMediaUploadEvent =
  { kind: 'progress'; progress: number } | { kind: 'complete'; media: PatientMedia };

export interface TreatmentMediaOption {
  id: string;
  label: string;
  status: string;
}

const CATEGORY_LABELS: Record<PatientMediaCategory, string> = {
  PROFILE_PHOTO: 'Profile photo',
  EXTRAORAL_PHOTO: 'Extraoral photo',
  INTRAORAL_PHOTO: 'Intraoral photo',
  PROGRESS_PHOTO: 'Progress photo',
  XRAY: 'X-ray',
  SCAN: 'Scan',
  PRESCRIPTION: 'Prescription',
  CONSENT: 'Consent',
  REFERRAL: 'Referral',
  REPORT: 'Report',
  ADMINISTRATIVE: 'Administrative',
  OTHER: 'Other',
};

export function patientMediaCategoryLabel(category: PatientMediaCategory): string {
  return CATEGORY_LABELS[category];
}

export function patientMediaDefaultTitle(category: PatientMediaCategory): string {
  return CATEGORY_LABELS[category];
}

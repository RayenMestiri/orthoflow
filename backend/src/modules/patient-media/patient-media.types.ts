import type { Types } from 'mongoose';
import type { ClinicRole } from '../../common/constants/roles.js';
import type { MutationContext } from '../../common/utils/request-context.js';

export const PATIENT_MEDIA_CATEGORIES = {
  PROFILE_PHOTO: 'PROFILE_PHOTO',
  EXTRAORAL_PHOTO: 'EXTRAORAL_PHOTO',
  INTRAORAL_PHOTO: 'INTRAORAL_PHOTO',
  PROGRESS_PHOTO: 'PROGRESS_PHOTO',
  XRAY: 'XRAY',
  SCAN: 'SCAN',
  PRESCRIPTION: 'PRESCRIPTION',
  CONSENT: 'CONSENT',
  REFERRAL: 'REFERRAL',
  REPORT: 'REPORT',
  ADMINISTRATIVE: 'ADMINISTRATIVE',
  OTHER: 'OTHER',
} as const;

export const PATIENT_MEDIA_CATEGORY_VALUES = Object.values(PATIENT_MEDIA_CATEGORIES);
export type PatientMediaCategory =
  (typeof PATIENT_MEDIA_CATEGORIES)[keyof typeof PATIENT_MEDIA_CATEGORIES];

export const PATIENT_MEDIA_TYPES = {
  IMAGE: 'IMAGE',
  PDF: 'PDF',
  DOCUMENT: 'DOCUMENT',
} as const;

export const PATIENT_MEDIA_TYPE_VALUES = Object.values(PATIENT_MEDIA_TYPES);
export type PatientMediaType = (typeof PATIENT_MEDIA_TYPES)[keyof typeof PATIENT_MEDIA_TYPES];

export const PATIENT_MEDIA_STATUSES = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;

export const PATIENT_MEDIA_STATUS_VALUES = Object.values(PATIENT_MEDIA_STATUSES);
export type PatientMediaStatus =
  (typeof PATIENT_MEDIA_STATUSES)[keyof typeof PATIENT_MEDIA_STATUSES];

export const PATIENT_MEDIA_STORAGE_PROVIDERS = {
  CLOUDINARY: 'CLOUDINARY',
} as const;

export const PATIENT_MEDIA_IMAGE_LIMIT_BYTES = 10 * 1024 * 1024;
export const PATIENT_MEDIA_PDF_LIMIT_BYTES = 20 * 1024 * 1024;
export const PATIENT_MEDIA_MAX_UPLOAD_BYTES = PATIENT_MEDIA_PDF_LIMIT_BYTES;

export interface PatientMediaAttributes {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  treatmentId: Types.ObjectId | null;
  category: PatientMediaCategory;
  mediaType: PatientMediaType;
  title: string;
  description: string | null;
  storageProvider: 'CLOUDINARY';
  publicId: string;
  resourceType: string;
  secureUrl: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  format: string | null;
  width: number | null;
  height: number | null;
  capturedAt: Date | null;
  uploadedAt: Date;
  uploadedByUserId: Types.ObjectId;
  status: PatientMediaStatus;
  archivedAt: Date | null;
  archivedByUserId: Types.ObjectId | null;
  archiveReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PatientMediaRecord = PatientMediaAttributes & { _id: Types.ObjectId };

export interface PatientMediaDto {
  id: string;
  clinicId: string;
  patientId: string;
  treatmentId: string | null;
  category: PatientMediaCategory;
  mediaType: PatientMediaType;
  title: string;
  description: string | null;
  /** 'CLOUDINARY' for real uploads; stored as 'CLOUDINARY' even for local fallback. */
  storageProvider: string;
  secureUrl: string;
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

export interface PatientMediaListFilters {
  category?: PatientMediaCategory;
  mediaType?: PatientMediaType;
  status?: PatientMediaStatus;
  treatmentId?: string;
  search?: string;
  from?: Date;
  to?: Date;
}

export interface PatientMediaUploadFile {
  content: Buffer;
  originalFileName: string;
  mimeType: string;
  mediaType: PatientMediaType;
}

export interface PatientMediaUploadMetadata {
  category: PatientMediaCategory;
  title: string;
  description?: string | null;
  treatmentId?: string | null;
  capturedAt?: Date | null;
}

export interface CreatePatientMediaInput extends PatientMediaUploadMetadata {
  clinicId: string;
  patientId: string;
  uploadedByUserId: string;
  mediaType: PatientMediaType;
  storageProvider: 'CLOUDINARY';
  publicId: string;
  resourceType: string;
  secureUrl: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  format: string | null;
  width: number | null;
  height: number | null;
  uploadedAt: Date;
}

export interface UpdatePatientMediaInput {
  category?: PatientMediaCategory;
  title?: string;
  description?: string | null;
  treatmentId?: string | null;
  capturedAt?: Date | null;
}

/** Trusted request context; the clinic role is resolved by the auth plugin. */
export interface PatientMediaMutationContext extends MutationContext {
  clinicRole: ClinicRole | null;
}

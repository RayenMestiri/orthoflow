import type { Types } from 'mongoose';

export const PATIENT_STATUSES = {
  ACTIVE: 'ACTIVE',
  /** Left the practice. Retained — records back a treatment and money history. */
  ARCHIVED: 'ARCHIVED',
} as const;

export type PatientStatus = (typeof PATIENT_STATUSES)[keyof typeof PATIENT_STATUSES];

export const PATIENT_STATUS_VALUES = Object.values(PATIENT_STATUSES) as [
  PatientStatus,
  ...PatientStatus[],
];

/**
 * Recorded because orthodontic treatment planning is partly sex-specific
 * (growth timing). `UNSPECIFIED` is the default so the field is never a barrier
 * to registering a patient.
 */
export const PATIENT_GENDERS = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  UNSPECIFIED: 'UNSPECIFIED',
} as const;

export type PatientGender = (typeof PATIENT_GENDERS)[keyof typeof PATIENT_GENDERS];

export const PATIENT_GENDER_VALUES = Object.values(PATIENT_GENDERS) as [
  PatientGender,
  ...PatientGender[],
];

export interface PatientAddress {
  line1: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}

/**
 * A person treated at one clinic.
 *
 * Kept deliberately thin: appointments, treatments, cash records and photos all
 * live in their own collections keyed by `patientId`. A patient document must
 * not grow without bound as years of care accumulate.
 *
 * No clinical or medical data is stored in the MVP.
 */
export interface PatientAttributes {
  /** Tenant key. Present in every single query against this collection. */
  clinicId: Types.ObjectId;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  gender: PatientGender;
  phone: string | null;
  email: string | null;
  address: PatientAddress;
  status: PatientStatus;
  /** Administrative notes only — never clinical findings. */
  notes: string | null;
  createdBy: Types.ObjectId;
  archivedAt: Date | null;
  archivedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PatientRecord = PatientAttributes & { _id: Types.ObjectId };

export interface CreatePatientInput {
  clinicId: string;
  createdBy: string;
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  gender?: PatientGender;
  phone?: string | null;
  email?: string | null;
  address?: Partial<PatientAddress>;
  notes?: string | null;
}

export interface UpdatePatientInput {
  firstName?: string;
  lastName?: string;
  birthDate?: string | null;
  gender?: PatientGender;
  phone?: string | null;
  email?: string | null;
  address?: Partial<PatientAddress>;
  notes?: string | null;
}

export interface PatientListFilters {
  status?: PatientStatus;
  /** Matched against first name, last name and phone. */
  search?: string;
}

export interface PatientDto {
  id: string;
  clinicId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  birthDate: string | null;
  gender: PatientGender;
  phone: string | null;
  email: string | null;
  address: PatientAddress;
  status: PatientStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

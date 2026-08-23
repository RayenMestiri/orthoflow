import type { Types } from 'mongoose';

export const GUARDIAN_RELATIONSHIPS = {
  MOTHER: 'MOTHER',
  FATHER: 'FATHER',
  LEGAL_GUARDIAN: 'LEGAL_GUARDIAN',
  OTHER: 'OTHER',
} as const;

export type GuardianRelationship =
  (typeof GUARDIAN_RELATIONSHIPS)[keyof typeof GUARDIAN_RELATIONSHIPS];
export const GUARDIAN_RELATIONSHIP_VALUES = Object.values(GUARDIAN_RELATIONSHIPS) as [
  GuardianRelationship,
  ...GuardianRelationship[],
];

export const CONTACT_PREFERENCES = {
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
  NO_PREFERENCE: 'NO_PREFERENCE',
} as const;

export type ContactPreference = (typeof CONTACT_PREFERENCES)[keyof typeof CONTACT_PREFERENCES];
export const CONTACT_PREFERENCE_VALUES = Object.values(CONTACT_PREFERENCES) as [
  ContactPreference,
  ...ContactPreference[],
];

export interface GuardianAttributes {
  clinicId: Types.ObjectId;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type GuardianRecord = GuardianAttributes & { _id: Types.ObjectId };

export interface PatientGuardianAttributes {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  guardianId: Types.ObjectId;
  relationship: GuardianRelationship;
  isPrimary: boolean;
  financiallyResponsible: boolean;
  contactPreference: ContactPreference;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type PatientGuardianRecord = PatientGuardianAttributes & { _id: Types.ObjectId };

export interface GuardianDto {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  relationship: GuardianRelationship;
  isPrimary: boolean;
  financiallyResponsible: boolean;
  contactPreference: ContactPreference;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGuardianInput {
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  relationship: GuardianRelationship;
  isPrimary?: boolean;
  financiallyResponsible?: boolean;
  contactPreference?: ContactPreference;
}

export interface UpdateGuardianInput {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  email?: string | null;
  relationship?: GuardianRelationship;
  isPrimary?: boolean;
  financiallyResponsible?: boolean;
  contactPreference?: ContactPreference;
}

export interface LinkExistingGuardianInput {
  guardianId: string;
  relationship: GuardianRelationship;
  isPrimary?: boolean;
  financiallyResponsible?: boolean;
  contactPreference?: ContactPreference;
}

export interface GuardianChildDto {
  patientId: string;
  fullName: string;
  referenceNumber: string | null;
  birthDate: string | null;
  relationship: GuardianRelationship;
  isPrimary: boolean;
}

export interface GuardianSearchDto {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  linkedPatientsCount: number;
}


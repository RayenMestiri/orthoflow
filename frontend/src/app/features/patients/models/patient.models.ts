export type PatientStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type PatientGender = 'MALE' | 'FEMALE' | 'UNSPECIFIED';
export type GuardianRelationship = 'MOTHER' | 'FATHER' | 'LEGAL_GUARDIAN' | 'OTHER';
export type ContactPreference = 'PHONE' | 'EMAIL' | 'NO_PREFERENCE';

export interface PatientAddress {
  line1: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface Patient {
  id: string;
  clinicId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  referenceNumber: string | null;
  birthDate: string | null;
  age: number | null;
  gender: PatientGender;
  phone: string | null;
  email: string | null;
  address: PatientAddress;
  status: PatientStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  primaryGuardian: { id: string; fullName: string; relationship: string } | null;
}

export interface Guardian {
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

export interface PatientActivity {
  id: string;
  action: string;
  actorUserId: string | null;
  actorName: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PatientInput {
  firstName: string;
  lastName: string;
  referenceNumber?: string | null;
  birthDate?: string | null;
  gender?: PatientGender;
  phone?: string | null;
  email?: string | null;
  address?: Partial<PatientAddress>;
  notes?: string | null;
  status?: Exclude<PatientStatus, 'ARCHIVED'>;
}

export interface GuardianInput {
  firstName: string;
  lastName: string;
  relationship: GuardianRelationship;
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
  financiallyResponsible?: boolean;
  contactPreference?: ContactPreference;
}

export interface PatientListQuery {
  page: number;
  limit: number;
  search: string;
  status: PatientStatus;
  sortBy: 'name' | 'createdAt' | 'birthDate';
  sortOrder: 'asc' | 'desc';
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

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

export type PatientActivityFilter = 'ALL' | 'CLINICAL' | 'APPOINTMENTS' | 'PAYMENTS' | 'DOCUMENTS';

export type PatientActivityTargetType =
  | 'APPOINTMENT'
  | 'TREATMENT'
  | 'CLINICAL_VISIT'
  | 'CASH_RECORD'
  | 'MEDIA'
  | 'CONSENT'
  | 'GENERATED_DOCUMENT';

export interface PatientActivity {
  id: string;
  category: 'CLINICAL' | 'APPOINTMENT' | 'PAYMENT' | 'DOCUMENT' | 'TREATMENT';
  type: string;
  occurredAt: string;
  title: string;
  subtitle: string | null;
  detail: string | null;
  actor: { displayName: string; role: string | null } | null;
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

export interface GuardianChild {
  patientId: string;
  fullName: string;
  referenceNumber: string | null;
  birthDate: string | null;
  relationship: GuardianRelationship;
  isPrimary: boolean;
}

export interface GuardianSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  linkedPatientsCount: number;
}

export interface LinkExistingGuardianInput {
  guardianId: string;
  relationship: GuardianRelationship;
  isPrimary?: boolean;
  financiallyResponsible?: boolean;
  contactPreference?: ContactPreference;
}

export interface PortalAccessStatus {
  status: 'NOT_INVITED' | 'INVITED' | 'ACTIVE' | 'REVOKED';
  email: string | null;
  expiresAt: string | null;
}

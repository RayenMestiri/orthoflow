export const PLATFORM_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  USER: 'USER',
} as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES];

export const CLINIC_ROLES = {
  CLINIC_OWNER: 'CLINIC_OWNER',
  ORTHODONTIST: 'ORTHODONTIST',
  DENTIST: 'DENTIST',
  SECRETARY: 'SECRETARY',
  ASSISTANT: 'ASSISTANT',
} as const;

export type ClinicRole = (typeof CLINIC_ROLES)[keyof typeof CLINIC_ROLES];

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  platformRole: PlatformRole;
  status: 'ACTIVE' | 'DISABLED';
  emailVerified: boolean;
  createdAt: string;
}

export interface ClinicMembership {
  clinicId: string;
  clinicName: string;
  clinicSlug: string;
  role: ClinicRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
}

export interface AuthTokens {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterClinicOwner {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  password: string;
  clinic: {
    name: string;
    phone?: string | null;
  };
}

export interface AuthSessionData {
  user: AuthUser;
  memberships: ClinicMembership[];
  tokens: AuthTokens;
}

export interface RegisterSessionData extends AuthSessionData {
  clinic: {
    id: string;
    name: string;
    slug: string;
  };
  verification: {
    required: true;
    delivery: 'SENT' | 'UNAVAILABLE';
  };
}

export interface CurrentUserData {
  user: AuthUser;
  memberships: ClinicMembership[];
}

export interface ApiEnvelope<T> {
  success: true;
  data: T;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type AuthStatus =
  'unknown' | 'loading' | 'guest' | 'verification-required' | 'authenticated';

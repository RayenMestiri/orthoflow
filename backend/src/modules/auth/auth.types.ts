import type { Types } from 'mongoose';
import type { ClinicDto } from '../clinics/clinic.types.js';
import type { ClinicRole, MembershipStatus } from '../../common/constants/roles.js';
import type { UserDto } from '../users/user.types.js';

export const SESSION_REVOKE_REASONS = {
  LOGOUT: 'LOGOUT',
  LOGOUT_ALL: 'LOGOUT_ALL',
  /** Normal rotation: this token was exchanged for a fresh one. */
  ROTATED: 'ROTATED',
  /** A rotated-away token was presented again — the family is burned. */
  REUSE_DETECTED: 'REUSE_DETECTED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  ADMIN_REVOKED: 'ADMIN_REVOKED',
} as const;

export type SessionRevokeReason =
  (typeof SESSION_REVOKE_REASONS)[keyof typeof SESSION_REVOKE_REASONS];

export const SESSION_REVOKE_REASON_VALUES = Object.values(SESSION_REVOKE_REASONS) as [
  SessionRevokeReason,
  ...SessionRevokeReason[],
];

/**
 * A refresh-token session.
 *
 * The raw refresh token is NEVER stored — only its SHA-256 digest — so a dump of
 * this collection cannot be replayed against the API. `familyId` links every
 * rotation of one login together, which is what makes replay detection possible.
 */
export interface AuthSessionAttributes {
  userId: Types.ObjectId;
  familyId: string;
  tokenHash: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: SessionRevokeReason | null;
  replacedBySessionId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AuthSessionRecord = AuthSessionAttributes & { _id: Types.ObjectId };

export interface CreateSessionInput {
  /**
   * Pre-generated so the id can be embedded in the refresh token before the row
   * is written — one insert instead of insert-then-update.
   */
  sessionId: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  ip?: string | null;
  userAgent?: string | null;
}

/** Request-scoped context attached to auth events for traceability. */
export interface AuthRequestContext {
  ip: string | null;
  userAgent: string | null;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string | null;
  clinic: {
    name: string;
    legalName?: string | null;
    email?: string | null;
    phone?: string | null;
    timezone?: string;
    currency?: string;
  };
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokensDto {
  accessToken: string;
  /** Also set as an httpOnly cookie; returned for non-browser clients. */
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface MembershipSummaryDto {
  clinicId: string;
  clinicName: string;
  clinicSlug: string;
  role: ClinicRole;
  status: MembershipStatus;
}

export interface AuthSessionDto {
  user: UserDto;
  memberships: MembershipSummaryDto[];
  tokens: AuthTokensDto;
}

export interface RegisterResultDto extends AuthSessionDto {
  clinic: ClinicDto;
  verification: {
    required: true;
    delivery: 'SENT' | 'UNAVAILABLE';
  };
}

export interface CurrentUserDto {
  user: UserDto;
  memberships: MembershipSummaryDto[];
}

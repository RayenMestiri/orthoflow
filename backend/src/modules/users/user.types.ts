import type { Types } from 'mongoose';
import type { PlatformRole } from '../../common/constants/roles.js';

export const USER_STATUSES = {
  ACTIVE: 'ACTIVE',
  /** Blocked from signing in. Kept for auditability — users are never deleted. */
  DISABLED: 'DISABLED',
} as const;

export type UserStatus = (typeof USER_STATUSES)[keyof typeof USER_STATUSES];

export const USER_STATUS_VALUES = Object.values(USER_STATUSES) as [UserStatus, ...UserStatus[]];

/**
 * A platform account.
 *
 * Deliberately clinic-agnostic: which clinics this person works in, and with
 * what authority, lives entirely in the `clinicMemberships` collection.
 */
export interface UserAttributes {
  email: string;
  /** Argon2id digest. `select: false` — never loaded unless explicitly asked. */
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  platformRole: PlatformRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRecord = UserAttributes & { _id: Types.ObjectId };

/** Same record with the password digest guaranteed absent from the type. */
export type SafeUserRecord = Omit<UserRecord, 'passwordHash'>;

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  platformRole?: PlatformRole;
}

/** Public shape of a user as returned by the API. */
export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  platformRole: PlatformRole;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
}

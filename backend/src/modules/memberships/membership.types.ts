import type { Types } from 'mongoose';
import type { ClinicRole, MembershipStatus } from '../../common/constants/roles.js';
import type { UserDto } from '../users/user.types.js';

/**
 * The join between a person and a clinic — and the only place a clinic role is
 * ever stored.
 *
 * Modelling authority here (rather than as a `role` field on the user) is what
 * lets an orthodontist work at two practices with different responsibilities,
 * and lets a clinic revoke access without touching the person's account.
 */
export interface ClinicMembershipAttributes {
  userId: Types.ObjectId;
  clinicId: Types.ObjectId;
  role: ClinicRole;
  status: MembershipStatus;
  invitedBy: Types.ObjectId | null;
  joinedAt: Date | null;
  removedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MembershipRecord = ClinicMembershipAttributes & { _id: Types.ObjectId };

export interface CreateMembershipInput {
  userId: string;
  clinicId: string;
  role: ClinicRole;
  status?: MembershipStatus;
  invitedBy?: string | null;
}

export interface UpdateMembershipInput {
  role?: ClinicRole;
  status?: MembershipStatus;
}

export interface MembershipListFilters {
  status?: MembershipStatus;
  role?: ClinicRole;
}

export interface MembershipDto {
  id: string;
  clinicId: string;
  userId: string;
  role: ClinicRole;
  status: MembershipStatus;
  joinedAt: string | null;
  createdAt: string;
  /** Present on listings, where members are resolved into people. */
  user?: UserDto;
}

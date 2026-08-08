import { toUserDto } from '../users/user.mapper.js';
import type { SafeUserRecord } from '../users/user.types.js';
import type { MembershipDto, MembershipRecord } from './membership.types.js';

export function toMembershipDto(record: MembershipRecord, user?: SafeUserRecord): MembershipDto {
  return {
    id: record._id.toString(),
    clinicId: record.clinicId.toString(),
    userId: record.userId.toString(),
    role: record.role,
    status: record.status,
    joinedAt: record.joinedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    ...(user ? { user: toUserDto(user) } : {}),
  };
}

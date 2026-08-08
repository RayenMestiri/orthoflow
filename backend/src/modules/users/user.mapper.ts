import type { SafeUserRecord, UserDto } from './user.types.js';

/**
 * Maps a persistence record to the public API shape.
 *
 * Mapping is explicit (never `...record`) so that a field added to the schema
 * tomorrow — a national id, a medical note — cannot become public by accident.
 */
export function toUserDto(record: SafeUserRecord): UserDto {
  return {
    id: record._id.toString(),
    email: record.email,
    firstName: record.firstName,
    lastName: record.lastName,
    fullName: `${record.firstName} ${record.lastName}`.trim(),
    phone: record.phone ?? null,
    platformRole: record.platformRole,
    status: record.status,
    emailVerified: record.emailVerifiedAt !== null,
    createdAt: record.createdAt.toISOString(),
  };
}

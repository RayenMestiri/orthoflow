/**
 * OrthoFlow has two independent role planes:
 *
 *  - PLATFORM role  → who you are on the OrthoFlow platform itself.
 *  - CLINIC role    → what you may do inside ONE specific clinic. Carried by a
 *                     ClinicMembership, never by the user document, because the
 *                     same professional may work in several clinics with
 *                     different responsibilities.
 *
 * Authentication answers "who are you?" (platform plane).
 * Authorization answers "may you do this in THIS clinic?" (clinic plane).
 */

export const PLATFORM_ROLES = {
  /** OrthoFlow staff. Bypasses clinic permission checks, still audited. */
  SUPER_ADMIN: 'SUPER_ADMIN',
  /** Ordinary account. All authority comes from clinic memberships. */
  USER: 'USER',
} as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES];

export const PLATFORM_ROLE_VALUES = Object.values(PLATFORM_ROLES) as [
  PlatformRole,
  ...PlatformRole[],
];

export const CLINIC_ROLES = {
  CLINIC_OWNER: 'CLINIC_OWNER',
  ORTHODONTIST: 'ORTHODONTIST',
  DENTIST: 'DENTIST',
  SECRETARY: 'SECRETARY',
  ASSISTANT: 'ASSISTANT',
} as const;

export type ClinicRole = (typeof CLINIC_ROLES)[keyof typeof CLINIC_ROLES];

export const CLINIC_ROLE_VALUES = Object.values(CLINIC_ROLES) as [ClinicRole, ...ClinicRole[]];

/** Roles that may be granted through the membership API by a clinic owner. */
export const ASSIGNABLE_CLINIC_ROLES: readonly ClinicRole[] = CLINIC_ROLE_VALUES;

/** Clinical practitioners — the only roles that may own a treatment. */
export const PRACTITIONER_ROLES: readonly ClinicRole[] = [
  CLINIC_ROLES.ORTHODONTIST,
  CLINIC_ROLES.DENTIST,
];

export const MEMBERSHIP_STATUSES = {
  /** Invited but has not accepted yet. Grants no access. */
  INVITED: 'INVITED',
  /** Normal working member. The only status that grants access. */
  ACTIVE: 'ACTIVE',
  /** Temporarily blocked. Kept for auditability. */
  SUSPENDED: 'SUSPENDED',
  /** No longer works here. Kept for auditability — never hard-deleted. */
  REMOVED: 'REMOVED',
} as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[keyof typeof MEMBERSHIP_STATUSES];

export const MEMBERSHIP_STATUS_VALUES = Object.values(MEMBERSHIP_STATUSES) as [
  MembershipStatus,
  ...MembershipStatus[],
];

import { CLINIC_ROLES, type ClinicRole } from './roles.js';

/**
 * Permissions are the single source of truth for clinic-scoped authorization.
 *
 * Routes never test roles directly (`if (role === 'SECRETARY')`); they declare
 * the permission they need and the auth plugin resolves it against the caller's
 * membership role. Adding a role therefore means editing ONE table.
 */
export const PERMISSIONS = {
  CLINIC_READ: 'clinic:read',
  CLINIC_UPDATE: 'clinic:update',

  MEMBERSHIP_READ: 'membership:read',
  MEMBERSHIP_CREATE: 'membership:create',
  MEMBERSHIP_UPDATE: 'membership:update',
  MEMBERSHIP_REMOVE: 'membership:remove',

  PATIENT_READ: 'patient:read',
  PATIENT_CREATE: 'patient:create',
  PATIENT_UPDATE: 'patient:update',
  PATIENT_ARCHIVE: 'patient:archive',

  AUDIT_LOG_READ: 'audit-log:read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const OWNER_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

const PRACTITIONER_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.CLINIC_READ,
  PERMISSIONS.MEMBERSHIP_READ,
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.PATIENT_CREATE,
  PERMISSIONS.PATIENT_UPDATE,
  PERMISSIONS.PATIENT_ARCHIVE,
];

const SECRETARY_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.CLINIC_READ,
  PERMISSIONS.MEMBERSHIP_READ,
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.PATIENT_CREATE,
  PERMISSIONS.PATIENT_UPDATE,
];

const ASSISTANT_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.CLINIC_READ,
  PERMISSIONS.MEMBERSHIP_READ,
  PERMISSIONS.PATIENT_READ,
];

export const ROLE_PERMISSIONS: Readonly<Record<ClinicRole, readonly Permission[]>> = {
  [CLINIC_ROLES.CLINIC_OWNER]: OWNER_PERMISSIONS,
  [CLINIC_ROLES.ORTHODONTIST]: PRACTITIONER_PERMISSIONS,
  [CLINIC_ROLES.DENTIST]: PRACTITIONER_PERMISSIONS,
  [CLINIC_ROLES.SECRETARY]: SECRETARY_PERMISSIONS,
  [CLINIC_ROLES.ASSISTANT]: ASSISTANT_PERMISSIONS,
};

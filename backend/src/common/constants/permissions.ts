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

  GUARDIAN_READ: 'guardian:read',
  GUARDIAN_CREATE: 'guardian:create',
  GUARDIAN_UPDATE: 'guardian:update',

  APPOINTMENT_READ: 'appointment:read',
  APPOINTMENT_CREATE: 'appointment:create',
  APPOINTMENT_UPDATE: 'appointment:update',
  APPOINTMENT_CANCEL: 'appointment:cancel',

  APPOINTMENT_TYPE_READ: 'appointment-type:read',
  APPOINTMENT_TYPE_MANAGE: 'appointment-type:manage',

  TREATMENT_READ: 'treatment:read',
  TREATMENT_CREATE: 'treatment:create',
  TREATMENT_UPDATE: 'treatment:update',
  /** Starting, pausing, resuming and completing care is a clinical decision. */
  TREATMENT_MANAGE_LIFECYCLE: 'treatment:manage-lifecycle',
  TREATMENT_PROGRESS_CREATE: 'treatment:progress-create',

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
  PERMISSIONS.GUARDIAN_READ,
  PERMISSIONS.GUARDIAN_CREATE,
  PERMISSIONS.GUARDIAN_UPDATE,
  PERMISSIONS.APPOINTMENT_READ,
  PERMISSIONS.APPOINTMENT_CREATE,
  PERMISSIONS.APPOINTMENT_UPDATE,
  PERMISSIONS.APPOINTMENT_CANCEL,
  PERMISSIONS.APPOINTMENT_TYPE_READ,
  PERMISSIONS.APPOINTMENT_TYPE_MANAGE,
  // Treatment is clinical work: practitioners own the whole lifecycle.
  PERMISSIONS.TREATMENT_READ,
  PERMISSIONS.TREATMENT_CREATE,
  PERMISSIONS.TREATMENT_UPDATE,
  PERMISSIONS.TREATMENT_MANAGE_LIFECYCLE,
  PERMISSIONS.TREATMENT_PROGRESS_CREATE,
];

const SECRETARY_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.CLINIC_READ,
  PERMISSIONS.MEMBERSHIP_READ,
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.PATIENT_CREATE,
  PERMISSIONS.PATIENT_UPDATE,
  PERMISSIONS.GUARDIAN_READ,
  PERMISSIONS.GUARDIAN_CREATE,
  PERMISSIONS.GUARDIAN_UPDATE,
  // The front desk runs the diary: it may book, move and cancel appointments.
  PERMISSIONS.APPOINTMENT_READ,
  PERMISSIONS.APPOINTMENT_CREATE,
  PERMISSIONS.APPOINTMENT_UPDATE,
  PERMISSIONS.APPOINTMENT_CANCEL,
  PERMISSIONS.APPOINTMENT_TYPE_READ,
  // The front desk sees the treatment plan but never decides clinical care.
  PERMISSIONS.TREATMENT_READ,
];

const ASSISTANT_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.CLINIC_READ,
  PERMISSIONS.MEMBERSHIP_READ,
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.GUARDIAN_READ,
  // Read-only on the diary: assistants follow it, they do not manage it.
  PERMISSIONS.APPOINTMENT_READ,
  PERMISSIONS.APPOINTMENT_TYPE_READ,
  PERMISSIONS.TREATMENT_READ,
  // Chairside assistants record what happened; they cannot alter the plan.
  PERMISSIONS.TREATMENT_PROGRESS_CREATE,
];

export const ROLE_PERMISSIONS: Readonly<Record<ClinicRole, readonly Permission[]>> = {
  [CLINIC_ROLES.CLINIC_OWNER]: OWNER_PERMISSIONS,
  [CLINIC_ROLES.ORTHODONTIST]: PRACTITIONER_PERMISSIONS,
  [CLINIC_ROLES.DENTIST]: PRACTITIONER_PERMISSIONS,
  [CLINIC_ROLES.SECRETARY]: SECRETARY_PERMISSIONS,
  [CLINIC_ROLES.ASSISTANT]: ASSISTANT_PERMISSIONS,
};

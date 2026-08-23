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

  PATIENT_MEDIA_READ: 'patient-media:read',
  PATIENT_MEDIA_MANAGE: 'patient-media:manage',

  GUARDIAN_READ: 'guardian:read',
  GUARDIAN_CREATE: 'guardian:create',
  GUARDIAN_UPDATE: 'guardian:update',
  GUARDIAN_DELETE: 'guardian:delete',
  PORTAL_ACCESS_MANAGE: 'portal-access:manage',

  APPOINTMENT_READ: 'appointment:read',
  APPOINTMENT_CREATE: 'appointment:create',
  APPOINTMENT_UPDATE: 'appointment:update',
  APPOINTMENT_CANCEL: 'appointment:cancel',
  /**
   * Putting a patient in the chair and declaring the visit over are clinical
   * acts, not desk work. Separate from `appointment:update` because the front
   * desk must still be able to check people in and move the queue.
   */
  APPOINTMENT_START_VISIT: 'appointment:start-visit',
  APPOINTMENT_COMPLETE_VISIT: 'appointment:complete-visit',

  APPOINTMENT_TYPE_READ: 'appointment-type:read',
  APPOINTMENT_TYPE_MANAGE: 'appointment-type:manage',

  TREATMENT_READ: 'treatment:read',
  TREATMENT_CREATE: 'treatment:create',
  TREATMENT_UPDATE: 'treatment:update',
  /** Starting, pausing, resuming and completing care is a clinical decision. */
  TREATMENT_MANAGE_LIFECYCLE: 'treatment:manage-lifecycle',

  RETENTION_READ: 'retention:read',
  RETENTION_MANAGE: 'retention:manage',

  CONSENT_READ: 'consent:read',
  CONSENT_CAPTURE: 'consent:capture',
  CONSENT_REVOKE: 'consent:revoke',
  CONSENT_VOID: 'consent:void',
  CONSENT_TEMPLATE_MANAGE: 'consent-template:manage',

  GENERATED_DOCUMENT_READ: 'generated-document:read',
  GENERATED_DOCUMENT_GENERATE_ADMINISTRATIVE: 'generated-document:generate-administrative',
  GENERATED_DOCUMENT_GENERATE_CLINICAL: 'generated-document:generate-clinical',
  GENERATED_DOCUMENT_GENERATE_FINANCIAL: 'generated-document:generate-financial',
  GENERATED_DOCUMENT_VOID: 'generated-document:void',
  DOCUMENT_TEMPLATE_MANAGE: 'document-template:manage',

  CLINICAL_VISIT_READ: 'clinical-visit:read',
  CLINICAL_VISIT_MANAGE: 'clinical-visit:manage',
  /** Amendments after sign-off are exceptional and owner-audited. */
  CLINICAL_VISIT_EDIT_COMPLETED: 'clinical-visit:edit-completed',

  /** Operational recommendation queue; intentionally grants no note-body access. */
  FOLLOW_UP_READ: 'follow-up:read',

  /**
   * Cash records acknowledge money the clinic physically received. They are
   * never deleted, so the permissions separate "record it" from "undo it".
   */
  CASH_RECORD_READ: 'cash-record:read',
  CASH_RECORD_CREATE: 'cash-record:create',
  CASH_RECORD_CANCEL: 'cash-record:cancel',
  /** Accepting more money than the treatment still owes is an owner decision. */
  CASH_RECORD_APPROVE_OVERPAYMENT: 'cash-record:approve-overpayment',
  RECEIPT_READ: 'receipt:read',

  TASK_READ: 'task:read',
  TASK_CREATE: 'task:create',
  TASK_UPDATE: 'task:update',
  TASK_CANCEL: 'task:cancel',
  TASK_MANAGE_ALL: 'task:manage-all',

  AUDIT_LOG_READ: 'audit-log:read',
  /** Read-only clinic aggregate analytics. Domain permissions still gate each section. */
  REPORT_READ: 'report:read',
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
  PERMISSIONS.PATIENT_MEDIA_READ,
  PERMISSIONS.PATIENT_MEDIA_MANAGE,
  PERMISSIONS.GUARDIAN_READ,
  PERMISSIONS.GUARDIAN_CREATE,
  PERMISSIONS.GUARDIAN_UPDATE,
  PERMISSIONS.GUARDIAN_DELETE,
  PERMISSIONS.APPOINTMENT_READ,
  PERMISSIONS.APPOINTMENT_CREATE,
  PERMISSIONS.APPOINTMENT_UPDATE,
  PERMISSIONS.APPOINTMENT_CANCEL,
  // Practitioners run the chair, so they own the clinical half of the flow.
  PERMISSIONS.APPOINTMENT_START_VISIT,
  PERMISSIONS.APPOINTMENT_COMPLETE_VISIT,
  PERMISSIONS.APPOINTMENT_TYPE_READ,
  PERMISSIONS.APPOINTMENT_TYPE_MANAGE,
  // Treatment is clinical work: practitioners own the whole lifecycle.
  PERMISSIONS.TREATMENT_READ,
  PERMISSIONS.TREATMENT_CREATE,
  PERMISSIONS.TREATMENT_UPDATE,
  PERMISSIONS.TREATMENT_MANAGE_LIFECYCLE,
  PERMISSIONS.RETENTION_READ,
  PERMISSIONS.RETENTION_MANAGE,
  PERMISSIONS.CONSENT_READ,
  PERMISSIONS.CONSENT_CAPTURE,
  PERMISSIONS.CONSENT_REVOKE,
  PERMISSIONS.GENERATED_DOCUMENT_READ,
  PERMISSIONS.GENERATED_DOCUMENT_GENERATE_ADMINISTRATIVE,
  PERMISSIONS.GENERATED_DOCUMENT_GENERATE_CLINICAL,
  PERMISSIONS.GENERATED_DOCUMENT_GENERATE_FINANCIAL,
  PERMISSIONS.CLINICAL_VISIT_READ,
  PERMISSIONS.CLINICAL_VISIT_MANAGE,
  PERMISSIONS.FOLLOW_UP_READ,
  // Practitioners take money at the chair, but undoing a record and waiving a
  // balance stay with the owner — see SECRETARY_PERMISSIONS for the same split.
  PERMISSIONS.CASH_RECORD_READ,
  PERMISSIONS.CASH_RECORD_CREATE,
  PERMISSIONS.RECEIPT_READ,
  PERMISSIONS.TASK_READ,
  PERMISSIONS.TASK_CREATE,
  PERMISSIONS.TASK_UPDATE,
  PERMISSIONS.TASK_CANCEL,
  PERMISSIONS.REPORT_READ,
];

const SECRETARY_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.CLINIC_READ,
  PERMISSIONS.MEMBERSHIP_READ,
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.PATIENT_CREATE,
  PERMISSIONS.PATIENT_UPDATE,
  PERMISSIONS.PATIENT_MEDIA_READ,
  // Administrative uploads are allowed; the media service rejects clinical
  // categories and clinical-file mutations for this role.
  PERMISSIONS.PATIENT_MEDIA_MANAGE,
  PERMISSIONS.GUARDIAN_READ,
  PERMISSIONS.GUARDIAN_CREATE,
  PERMISSIONS.GUARDIAN_UPDATE,
  PERMISSIONS.GUARDIAN_DELETE,
  // The front desk runs the diary: it may book, move and cancel appointments.
  PERMISSIONS.APPOINTMENT_READ,
  PERMISSIONS.APPOINTMENT_CREATE,
  PERMISSIONS.APPOINTMENT_UPDATE,
  PERMISSIONS.APPOINTMENT_CANCEL,
  PERMISSIONS.APPOINTMENT_TYPE_READ,
  // The front desk sees the treatment plan but never decides clinical care.
  PERMISSIONS.TREATMENT_READ,
  PERMISSIONS.RETENTION_READ,
  PERMISSIONS.CONSENT_READ,
  PERMISSIONS.CONSENT_CAPTURE,
  PERMISSIONS.GENERATED_DOCUMENT_READ,
  PERMISSIONS.GENERATED_DOCUMENT_GENERATE_ADMINISTRATIVE,
  PERMISSIONS.GENERATED_DOCUMENT_GENERATE_FINANCIAL,
  PERMISSIONS.FOLLOW_UP_READ,
  // The front desk is who physically takes the money, so it records payments
  // and prints receipts — but cancelling a record is an owner decision.
  PERMISSIONS.CASH_RECORD_READ,
  PERMISSIONS.CASH_RECORD_CREATE,
  PERMISSIONS.RECEIPT_READ,
  PERMISSIONS.TASK_READ,
  PERMISSIONS.TASK_CREATE,
  PERMISSIONS.TASK_UPDATE,
  PERMISSIONS.TASK_CANCEL,
  PERMISSIONS.REPORT_READ,
];

const ASSISTANT_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.CLINIC_READ,
  PERMISSIONS.MEMBERSHIP_READ,
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.PATIENT_MEDIA_READ,
  PERMISSIONS.GUARDIAN_READ,
  // Read-only on the diary: assistants follow it, they do not manage it.
  PERMISSIONS.APPOINTMENT_READ,
  PERMISSIONS.APPOINTMENT_TYPE_READ,
  PERMISSIONS.TREATMENT_READ,
  PERMISSIONS.TASK_READ,
  PERMISSIONS.TASK_UPDATE,
];

export const ROLE_PERMISSIONS: Readonly<Record<ClinicRole, readonly Permission[]>> = {
  [CLINIC_ROLES.CLINIC_OWNER]: OWNER_PERMISSIONS,
  [CLINIC_ROLES.ORTHODONTIST]: PRACTITIONER_PERMISSIONS,
  [CLINIC_ROLES.DENTIST]: PRACTITIONER_PERMISSIONS,
  [CLINIC_ROLES.SECRETARY]: SECRETARY_PERMISSIONS,
  [CLINIC_ROLES.ASSISTANT]: ASSISTANT_PERMISSIONS,
};

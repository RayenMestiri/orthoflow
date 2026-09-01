import type { Types } from 'mongoose';

/**
 * Business events worth reconstructing months later.
 *
 * Dotted `resource.verb` names sort and filter well, and stay readable in an
 * export handed to a clinic owner during a dispute.
 */
export const AUDIT_ACTIONS = {
  AUTH_REGISTERED: 'auth.registered',
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_REFRESH_REUSE_DETECTED: 'auth.refresh_reuse_detected',
  AUTH_EMAIL_VERIFIED: 'auth.email_verified',
  AUTH_PASSWORD_RESET: 'auth.password_reset',
  PORTAL_INVITED: 'portal.invited',
  PORTAL_ACTIVATED: 'portal.activated',
  PORTAL_LOGIN: 'portal.login',
  PORTAL_LOGOUT: 'portal.logout',
  PORTAL_PASSWORD_RESET: 'portal.password_reset',
  PORTAL_REFRESH_REUSE_DETECTED: 'portal.refresh_reuse_detected',
  PORTAL_ACCESS_REVOKED: 'portal.access_revoked',
  PORTAL_DOCUMENT_SHARED: 'portal.document_shared',
  PORTAL_DOCUMENT_SHARE_REVOKED: 'portal.document_share_revoked',
  PORTAL_DOCUMENT_DOWNLOADED: 'portal.document_downloaded',
  PORTAL_CONSENT_DOWNLOADED: 'portal.consent_downloaded',
  PORTAL_RECEIPT_VIEWED: 'portal.receipt_viewed',

  CLINIC_CREATED: 'clinic.created',
  CLINIC_UPDATED: 'clinic.updated',
  CLINIC_SETTINGS_UPDATED: 'clinic.settings_updated',
  CLINIC_WORKING_HOURS_UPDATED: 'clinic.working_hours_updated',
  CLINIC_SCHEDULING_SETTINGS_UPDATED: 'clinic.scheduling_settings_updated',
  CLINIC_CARE_CONTINUITY_SETTINGS_UPDATED: 'clinic.care_continuity_settings_updated',
  CLINIC_COMMUNICATION_SETTINGS_UPDATED: 'clinic.communication_settings_updated',
  COMMUNICATION_RETRY_REQUESTED: 'communication.retry_requested',

  MEMBERSHIP_CREATED: 'membership.created',
  MEMBERSHIP_ROLE_CHANGED: 'membership.role_changed',
  MEMBERSHIP_STATUS_CHANGED: 'membership.status_changed',

  PATIENT_CREATED: 'patient.created',
  PATIENT_UPDATED: 'patient.updated',
  PATIENT_ARCHIVED: 'patient.archived',
  PATIENT_RESTORED: 'patient.restored',
  PATIENT_MEDIA_UPLOADED: 'patient_media.uploaded',
  PATIENT_MEDIA_UPDATED: 'patient_media.updated',
  PATIENT_MEDIA_ARCHIVED: 'patient_media.archived',
  PATIENT_MEDIA_RESTORED: 'patient_media.restored',
  PATIENT_MEDIA_DELETED: 'patient_media.deleted',
  PATIENT_MEDIA_REPLACED: 'patient_media.replaced',

  GUARDIAN_CREATED: 'guardian.created',
  GUARDIAN_LINKED: 'guardian.linked',
  GUARDIAN_UPDATED: 'guardian.updated',
  GUARDIAN_UNLINKED: 'guardian.unlinked',
  PRIMARY_GUARDIAN_CHANGED: 'guardian.primary_changed',

  APPOINTMENT_CREATED: 'appointment.created',
  APPOINTMENT_UPDATED: 'appointment.updated',
  /** Moved or resized — the time changed, which is worth its own event. */
  APPOINTMENT_RESCHEDULED: 'appointment.rescheduled',
  APPOINTMENT_DURATION_CHANGED: 'appointment.duration_changed',
  APPOINTMENT_OVERBOOKED: 'appointment.overbooked',
  APPOINTMENT_STATUS_CHANGED: 'appointment.status_changed',
  APPOINTMENT_CANCELLED: 'appointment.cancelled',
  APPOINTMENT_NO_SHOW: 'appointment.no_show',

  TREATMENT_CREATED: 'treatment.created',
  TREATMENT_UPDATED: 'treatment.updated',
  TREATMENT_STARTED: 'treatment.started',
  TREATMENT_PAUSED: 'treatment.paused',
  TREATMENT_RESUMED: 'treatment.resumed',
  TREATMENT_COMPLETED: 'treatment.completed',
  TREATMENT_CANCELLED: 'treatment.cancelled',
  TREATMENT_MILESTONE_CREATED: 'treatment_milestone.created',
  TREATMENT_MILESTONE_UPDATED: 'treatment_milestone.updated',

  RETENTION_CREATED: 'retention.created',
  RETENTION_UPDATED: 'retention.updated',
  RETENTION_ACTIVATED: 'retention.activated',
  RETENTION_COMPLETED: 'retention.completed',
  RETENTION_CANCELLED: 'retention.cancelled',
  RETAINER_DELIVERED: 'retainer.delivered',
  RETAINER_REPLACED: 'retainer.replaced',
  RETAINER_LOST: 'retainer.lost',
  RETAINER_DISCONTINUED: 'retainer.discontinued',

  CONSENT_TEMPLATE_CREATED: 'consent_template.created',
  CONSENT_TEMPLATE_UPDATED: 'consent_template.updated',
  CONSENT_TEMPLATE_VERSION_CREATED: 'consent_template.version_created',
  CONSENT_TEMPLATE_VERSION_ACTIVATED: 'consent_template.version_activated',
  CONSENT_TEMPLATE_ARCHIVED: 'consent_template.archived',
  CONSENT_SIGNED: 'consent.signed',
  CONSENT_REVOKED: 'consent.revoked',
  CONSENT_VOIDED: 'consent.voided',

  DOCUMENT_TEMPLATE_CREATED: 'document_template.created',
  DOCUMENT_TEMPLATE_UPDATED: 'document_template.updated',
  DOCUMENT_TEMPLATE_ACTIVATED: 'document_template.activated',
  DOCUMENT_TEMPLATE_ARCHIVED: 'document_template.archived',
  GENERATED_DOCUMENT_FINALIZED: 'generated_document.finalized',
  GENERATED_DOCUMENT_VOIDED: 'generated_document.voided',
  GENERATED_DOCUMENT_EXPIRED: 'generated_document.expired',
  GENERATED_DOCUMENT_STORAGE_DELETED: 'generated_document.storage_deleted',
  GENERATED_DOCUMENT_CLEANUP_FAILED: 'generated_document.cleanup_failed',

  CLINICAL_VISIT_CREATED: 'clinical_visit.created',
  CLINICAL_VISIT_UPDATED: 'clinical_visit.updated',
  CLINICAL_VISIT_COMPLETED: 'clinical_visit.completed',

  CASH_RECORD_CREATED: 'cash_record.created',
  CASH_RECORD_CANCELLED: 'cash_record.cancelled',
  /** A cancellation paired with a compensating record replacing it. */
  CASH_RECORD_CORRECTED: 'cash_record.corrected',
  CASH_RECORD_OVERPAYMENT_APPROVED: 'cash_record.overpayment_approved',
  RECEIPT_ISSUED: 'receipt.issued',
  RECEIPT_CANCELLED: 'receipt.cancelled',

  APPOINTMENT_TYPE_CREATED: 'appointment_type.created',
  APPOINTMENT_TYPE_UPDATED: 'appointment_type.updated',

  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_REASSIGNED: 'task.reassigned',
  TASK_STARTED: 'task.started',
  TASK_COMPLETED: 'task.completed',
  TASK_CANCELLED: 'task.cancelled',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_ACTION_VALUES = Object.values(AUDIT_ACTIONS) as [AuditAction, ...AuditAction[]];

export const AUDIT_RESOURCE_TYPES = {
  USER: 'user',
  CLINIC: 'clinic',
  MEMBERSHIP: 'membership',
  PATIENT: 'patient',
  PATIENT_MEDIA: 'patient_media',
  GUARDIAN: 'guardian',
  APPOINTMENT: 'appointment',
  APPOINTMENT_TYPE: 'appointment_type',
  TREATMENT: 'treatment',
  TREATMENT_MILESTONE: 'treatment_milestone',
  RETENTION_PLAN: 'retention_plan',
  RETAINER_DEVICE: 'retainer_device',
  CONSENT_TEMPLATE: 'consent_template',
  CONSENT: 'consent',
  DOCUMENT_TEMPLATE: 'document_template',
  GENERATED_DOCUMENT: 'generated_document',
  CLINICAL_VISIT: 'clinical_visit',
  CASH_RECORD: 'cash_record',
  RECEIPT: 'receipt',
  TASK: 'task',
  COMMUNICATION_JOB: 'communication_job',
  AUTH_SESSION: 'auth_session',
  PORTAL_USER: 'portal_user',
  PORTAL_SESSION: 'portal_session',
} as const;

export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[keyof typeof AUDIT_RESOURCE_TYPES];

export const AUDIT_RESOURCE_TYPE_VALUES = Object.values(AUDIT_RESOURCE_TYPES) as [
  AuditResourceType,
  ...AuditResourceType[],
];

/**
 * An immutable record of something that happened.
 *
 * Append-only by design: there is no update or delete path anywhere in the
 * codebase, and normal clinic users can only read entries for their own clinic.
 */
export interface AuditLogAttributes {
  /** `null` only for platform-level events that precede any clinic. */
  clinicId: Types.ObjectId | null;
  /** `null` for system-originated events (jobs, migrations). */
  actorUserId: Types.ObjectId | null;
  actorPortalUserId: Types.ObjectId | null;
  actorKind: 'STAFF' | 'PORTAL' | 'SYSTEM';
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: Types.ObjectId | null;
  /** Small, non-sensitive context. Never tokens, passwords or clinical notes. */
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export type AuditLogRecord = AuditLogAttributes & { _id: Types.ObjectId };

export interface RecordAuditEventInput {
  clinicId?: string | null;
  actorUserId?: string | null;
  actorPortalUserId?: string | null;
  actorKind?: 'STAFF' | 'PORTAL' | 'SYSTEM';
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditLogListFilters {
  action?: AuditAction;
  resourceType?: AuditResourceType;
  resourceId?: string;
  actorUserId?: string;
  from?: Date;
  to?: Date;
}

export interface AuditLogDto {
  id: string;
  clinicId: string | null;
  actorUserId: string | null;
  actorPortalUserId: string | null;
  actorKind: 'STAFF' | 'PORTAL' | 'SYSTEM';
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

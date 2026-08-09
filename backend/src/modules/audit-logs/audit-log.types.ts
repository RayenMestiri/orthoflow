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

  CLINIC_CREATED: 'clinic.created',
  CLINIC_UPDATED: 'clinic.updated',
  CLINIC_SETTINGS_UPDATED: 'clinic.settings_updated',
  CLINIC_WORKING_HOURS_UPDATED: 'clinic.working_hours_updated',
  CLINIC_SCHEDULING_SETTINGS_UPDATED: 'clinic.scheduling_settings_updated',

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

  CASH_RECORD_CREATED: 'cash_record.created',
  CASH_RECORD_CANCELLED: 'cash_record.cancelled',
  /** A cancellation paired with a compensating record replacing it. */
  CASH_RECORD_CORRECTED: 'cash_record.corrected',
  CASH_RECORD_OVERPAYMENT_APPROVED: 'cash_record.overpayment_approved',
  RECEIPT_ISSUED: 'receipt.issued',
  RECEIPT_CANCELLED: 'receipt.cancelled',

  APPOINTMENT_TYPE_CREATED: 'appointment_type.created',
  APPOINTMENT_TYPE_UPDATED: 'appointment_type.updated',
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
  CASH_RECORD: 'cash_record',
  RECEIPT: 'receipt',
  AUTH_SESSION: 'auth_session',
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
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

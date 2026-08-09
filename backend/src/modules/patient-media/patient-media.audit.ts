import type { MutationContext } from '../../common/utils/request-context.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';

export type PatientMediaAuditEvent = 'uploaded' | 'updated' | 'archived' | 'restored' | 'deleted' | 'replaced';

export interface PatientMediaAuditInput extends MutationContext {
  clinicId: string;
  patientId: string;
  mediaId: string;
  treatmentId?: string | null;
  event: PatientMediaAuditEvent;
  changedFields?: string[];
}

export interface PatientMediaAuditPort {
  record(input: PatientMediaAuditInput): Promise<void>;
}

export class PatientMediaAuditAdapter implements PatientMediaAuditPort {
  constructor(private readonly audit: AuditLogService = auditLogService) {}

  async record(input: PatientMediaAuditInput): Promise<void> {
    await this.audit.record({
      clinicId: input.clinicId,
      actorUserId: input.actorUserId,
      action: {
        uploaded: AUDIT_ACTIONS.PATIENT_MEDIA_UPLOADED,
        updated: AUDIT_ACTIONS.PATIENT_MEDIA_UPDATED,
        archived: AUDIT_ACTIONS.PATIENT_MEDIA_ARCHIVED,
        restored: AUDIT_ACTIONS.PATIENT_MEDIA_RESTORED,
        deleted: AUDIT_ACTIONS.PATIENT_MEDIA_DELETED,
        replaced: AUDIT_ACTIONS.PATIENT_MEDIA_REPLACED,
      }[input.event],
      resourceType: AUDIT_RESOURCE_TYPES.PATIENT_MEDIA,
      resourceId: input.mediaId,
      metadata: {
        patientId: input.patientId,
        ...(input.treatmentId ? { treatmentId: input.treatmentId } : {}),
        ...(input.changedFields ? { changedFields: input.changedFields } : {}),
      },
      ip: input.ip,
      userAgent: input.userAgent,
    });
  }
}

export const patientMediaAudit = new PatientMediaAuditAdapter();

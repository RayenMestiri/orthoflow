import { Schema, model } from 'mongoose';
import {
  AUDIT_ACTION_VALUES,
  AUDIT_RESOURCE_TYPE_VALUES,
  type AuditLogAttributes,
} from './audit-log.types.js';

const auditLogSchema = new Schema<AuditLogAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', default: null },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true, enum: AUDIT_ACTION_VALUES },
    resourceType: { type: String, required: true, enum: AUDIT_RESOURCE_TYPE_VALUES },
    resourceId: { type: Schema.Types.ObjectId, default: null },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
    ip: { type: String, default: null, maxlength: 64 },
    userAgent: { type: String, default: null, maxlength: 256 },
  },
  {
    // Append-only: an audit row is never modified, so there is no `updatedAt`.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'auditLogs',
    strict: 'throw',
    minimize: false,
  },
);

/** Primary access pattern: "what happened in this clinic, most recent first". */
auditLogSchema.index({ clinicId: 1, createdAt: -1 });
auditLogSchema.index({ clinicId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ clinicId: 1, resourceType: 1, resourceId: 1, createdAt: -1 });

export const AuditLogModel = model<AuditLogAttributes>('AuditLog', auditLogSchema);

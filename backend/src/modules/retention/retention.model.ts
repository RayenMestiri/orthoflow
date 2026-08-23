import { Schema, model } from 'mongoose';
import {
  RETAINER_ARCH_VALUES,
  RETAINER_STATUSES,
  RETAINER_STATUS_VALUES,
  RETAINER_TYPE_VALUES,
  RETENTION_STATUSES,
  RETENTION_STATUS_VALUES,
  type RetainerDeviceAttributes,
  type RetentionPlanAttributes,
} from './retention.types.js';

const retentionPlanSchema = new Schema<RetentionPlanAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    treatmentId: { type: Schema.Types.ObjectId, ref: 'Treatment', required: true },
    status: { type: String, enum: RETENTION_STATUS_VALUES, default: RETENTION_STATUSES.PLANNED },
    initialControlRecommendedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: null, trim: true, maxlength: 500 },
    completionReason: { type: String, default: null, trim: true, maxlength: 500 },
    notes: { type: String, default: null, trim: true, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { collection: 'retentionPlans', timestamps: true, strict: 'throw', minimize: false },
);
retentionPlanSchema.index({ clinicId: 1, treatmentId: 1 }, { unique: true });
retentionPlanSchema.index({ clinicId: 1, patientId: 1, status: 1, createdAt: -1 });
retentionPlanSchema.index({ clinicId: 1, status: 1, startedAt: -1 });
retentionPlanSchema.index({ clinicId: 1, status: 1, completedAt: 1 });

const retainerDeviceSchema = new Schema<RetainerDeviceAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    treatmentId: { type: Schema.Types.ObjectId, ref: 'Treatment', required: true },
    retentionPlanId: { type: Schema.Types.ObjectId, ref: 'RetentionPlan', required: true },
    type: { type: String, enum: RETAINER_TYPE_VALUES, required: true },
    customTypeLabel: { type: String, default: null, trim: true, maxlength: 80 },
    arch: { type: String, enum: RETAINER_ARCH_VALUES, required: true },
    status: { type: String, enum: RETAINER_STATUS_VALUES, default: RETAINER_STATUSES.ACTIVE },
    deliveredAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    replacesRetainerId: { type: Schema.Types.ObjectId, ref: 'RetainerDevice', default: null },
    notes: { type: String, default: null, trim: true, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { collection: 'retainerDevices', timestamps: true, strict: 'throw', minimize: false },
);
retainerDeviceSchema.index({ clinicId: 1, retentionPlanId: 1, deliveredAt: -1 });
retainerDeviceSchema.index({ clinicId: 1, patientId: 1, status: 1, deliveredAt: -1 });

export const RetentionPlanModel = model<RetentionPlanAttributes>('RetentionPlan', retentionPlanSchema);
export const RetainerDeviceModel = model<RetainerDeviceAttributes>('RetainerDevice', retainerDeviceSchema);

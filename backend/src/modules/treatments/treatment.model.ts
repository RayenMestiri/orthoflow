import { Schema, model } from 'mongoose';
import {
  TREATMENT_MILESTONE_TYPE_VALUES,
  TREATMENT_STATUSES,
  TREATMENT_STATUS_VALUES,
  TREATMENT_TYPE_VALUES,
  type TreatmentAttributes,
  type TreatmentMilestoneAttributes,
} from './treatment.types.js';

const treatmentSchema = new Schema<TreatmentAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, enum: TREATMENT_TYPE_VALUES },
    customTypeLabel: { type: String, default: null, trim: true, maxlength: 80 },
    status: {
      type: String,
      required: true,
      enum: TREATMENT_STATUS_VALUES,
      default: TREATMENT_STATUSES.PLANNED,
    },
    startDate: { type: Date, default: null },
    expectedEndDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    agreedPrice: { type: Number, default: null, min: 0, max: 1_000_000 },
    notes: { type: String, default: null, trim: true, maxlength: 2000 },
    cancellationReason: { type: String, default: null, trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    collection: 'treatments',
    strict: 'throw',
    minimize: false,
  },
);

treatmentSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 });
treatmentSchema.index({ clinicId: 1, status: 1, startDate: -1 });
/** Database-level race protection for the one-active-treatment invariant. */
treatmentSchema.index(
  { clinicId: 1, patientId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: TREATMENT_STATUSES.ACTIVE },
    name: 'one_active_treatment_per_patient',
  },
);

export const TreatmentModel = model<TreatmentAttributes>('Treatment', treatmentSchema);

const treatmentMilestoneSchema = new Schema<TreatmentMilestoneAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    treatmentId: { type: Schema.Types.ObjectId, ref: 'Treatment', required: true },
    type: { type: String, required: true, enum: TREATMENT_MILESTONE_TYPE_VALUES },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, default: null, trim: true, maxlength: 1000 },
    occurredAt: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    collection: 'treatmentMilestones',
    strict: 'throw',
    minimize: false,
  },
);

treatmentMilestoneSchema.index({ clinicId: 1, treatmentId: 1, occurredAt: -1 });
treatmentMilestoneSchema.index({ clinicId: 1, patientId: 1, occurredAt: -1 });

export const TreatmentMilestoneModel = model<TreatmentMilestoneAttributes>(
  'TreatmentMilestone',
  treatmentMilestoneSchema,
);

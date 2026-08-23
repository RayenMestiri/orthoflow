import { Schema, model } from 'mongoose';
import {
  CLINICAL_PROCEDURE_VALUES,
  CLINICAL_REASON_CODE_VALUES,
  CLINICAL_VISIT_STATUSES,
  CLINICAL_VISIT_STATUS_VALUES,
  type ClinicalVisitAttributes,
} from './clinical-visit.types.js';

const clinicalVisitSchema = new Schema<ClinicalVisitAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true },
    treatmentId: { type: Schema.Types.ObjectId, ref: 'Treatment', default: null },
    retentionPlanId: { type: Schema.Types.ObjectId, ref: 'RetentionPlan', default: null },
    status: {
      type: String,
      enum: CLINICAL_VISIT_STATUS_VALUES,
      default: CLINICAL_VISIT_STATUSES.DRAFT,
      required: true,
    },
    reasonCode: { type: String, enum: CLINICAL_REASON_CODE_VALUES, default: null },
    reasonOther: { type: String, trim: true, maxlength: 160, default: null },
    observations: { type: String, trim: true, maxlength: 5000, default: null },
    procedures: { type: [String], enum: CLINICAL_PROCEDURE_VALUES, default: [] },
    procedureDetails: { type: String, trim: true, maxlength: 5000, default: null },
    patientInstructions: { type: String, trim: true, maxlength: 3000, default: null },
    doctorNote: { type: String, trim: true, maxlength: 5000, default: null },
    nextVisitRecommendedAt: { type: Date, default: null },
    nextStepNote: { type: String, trim: true, maxlength: 1000, default: null },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'clinicalVisits', strict: 'throw', minimize: false },
);

clinicalVisitSchema.index(
  { clinicId: 1, appointmentId: 1 },
  { unique: true, name: 'one_clinical_visit_per_appointment' },
);
clinicalVisitSchema.index({ clinicId: 1, patientId: 1, startedAt: -1 });
clinicalVisitSchema.index({ clinicId: 1, treatmentId: 1, startedAt: -1 });
clinicalVisitSchema.index({ clinicId: 1, retentionPlanId: 1, status: 1, completedAt: -1 });
clinicalVisitSchema.index({ clinicId: 1, status: 1, nextVisitRecommendedAt: 1, completedAt: -1 });

export const ClinicalVisitModel = model<ClinicalVisitAttributes>(
  'ClinicalVisit',
  clinicalVisitSchema,
);

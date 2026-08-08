import { Schema, model } from 'mongoose';
import {
  CONTACT_PREFERENCES,
  CONTACT_PREFERENCE_VALUES,
  GUARDIAN_RELATIONSHIP_VALUES,
  type PatientGuardianAttributes,
} from './guardian.types.js';

const patientGuardianSchema = new Schema<PatientGuardianAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    guardianId: { type: Schema.Types.ObjectId, ref: 'Guardian', required: true },
    relationship: { type: String, required: true, enum: GUARDIAN_RELATIONSHIP_VALUES },
    isPrimary: { type: Boolean, required: true, default: false },
    financiallyResponsible: { type: Boolean, required: true, default: false },
    contactPreference: {
      type: String,
      required: true,
      enum: CONTACT_PREFERENCE_VALUES,
      default: CONTACT_PREFERENCES.NO_PREFERENCE,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'patientGuardians',
    strict: 'throw',
  },
);

patientGuardianSchema.index({ clinicId: 1, patientId: 1, guardianId: 1 }, { unique: true });
patientGuardianSchema.index({ clinicId: 1, patientId: 1, isPrimary: -1, createdAt: 1 });
patientGuardianSchema.index({ clinicId: 1, guardianId: 1, patientId: 1 });

export const PatientGuardianModel = model<PatientGuardianAttributes>(
  'PatientGuardian',
  patientGuardianSchema,
);

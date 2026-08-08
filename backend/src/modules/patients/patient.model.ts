import { Schema, model } from 'mongoose';
import {
  PATIENT_GENDERS,
  PATIENT_GENDER_VALUES,
  PATIENT_STATUSES,
  PATIENT_STATUS_VALUES,
  type PatientAttributes,
} from './patient.types.js';

const addressSchema = new Schema(
  {
    line1: { type: String, default: null, trim: true, maxlength: 160 },
    city: { type: String, default: null, trim: true, maxlength: 80 },
    postalCode: { type: String, default: null, trim: true, maxlength: 20 },
    country: { type: String, default: null, trim: true, maxlength: 80 },
  },
  { _id: false },
);

const patientSchema = new Schema<PatientAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    referenceNumber: { type: String, default: null, trim: true, uppercase: true, maxlength: 48 },
    birthDate: { type: Date, default: null },
    gender: {
      type: String,
      required: true,
      enum: PATIENT_GENDER_VALUES,
      default: PATIENT_GENDERS.UNSPECIFIED,
    },
    phone: { type: String, default: null, trim: true, maxlength: 32 },
    email: { type: String, default: null, trim: true, lowercase: true, maxlength: 254 },
    address: { type: addressSchema, default: () => ({}) },
    status: {
      type: String,
      required: true,
      enum: PATIENT_STATUS_VALUES,
      default: PATIENT_STATUSES.ACTIVE,
    },
    notes: { type: String, default: null, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    collection: 'patients',
    strict: 'throw',
    minimize: false,
  },
);

/**
 * Every index starts with `clinicId`.
 *
 * That is not a performance detail — it mirrors the access pattern the API
 * enforces: there is no such thing as a query across clinics.
 */
patientSchema.index({ clinicId: 1, status: 1, lastName: 1, firstName: 1 });
patientSchema.index(
  { clinicId: 1, referenceNumber: 1 },
  { unique: true, partialFilterExpression: { referenceNumber: { $type: 'string' } } },
);
patientSchema.index({ clinicId: 1, phone: 1 });
patientSchema.index({ clinicId: 1, createdAt: -1 });

export const PatientModel = model<PatientAttributes>('Patient', patientSchema);

import { Schema, model } from 'mongoose';
import { CLINIC_STATUSES, CLINIC_STATUS_VALUES, type ClinicAttributes } from './clinic.types.js';

const addressSchema = new Schema(
  {
    line1: { type: String, default: null, trim: true, maxlength: 160 },
    line2: { type: String, default: null, trim: true, maxlength: 160 },
    city: { type: String, default: null, trim: true, maxlength: 80 },
    postalCode: { type: String, default: null, trim: true, maxlength: 20 },
    country: { type: String, default: null, trim: true, maxlength: 80 },
  },
  { _id: false },
);

const clinicSchema = new Schema<ClinicAttributes>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
      unique: true,
    },
    legalName: { type: String, default: null, trim: true, maxlength: 160 },
    email: { type: String, default: null, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, default: null, trim: true, maxlength: 32 },
    address: { type: addressSchema, default: () => ({}) },
    timezone: { type: String, required: true, default: 'Africa/Tunis', maxlength: 64 },
    currency: {
      type: String,
      required: true,
      default: 'TND',
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    status: {
      type: String,
      required: true,
      enum: CLINIC_STATUS_VALUES,
      default: CLINIC_STATUSES.ACTIVE,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    archivedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'clinics',
    strict: 'throw',
    minimize: false,
  },
);

clinicSchema.index({ status: 1, createdAt: -1 });

export const ClinicModel = model<ClinicAttributes>('Clinic', clinicSchema);

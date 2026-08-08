import { Schema, model } from 'mongoose';
import type { AppointmentTypeAttributes } from './appointment-type.types.js';

const appointmentTypeSchema = new Schema<AppointmentTypeAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    durationMinutes: { type: Number, required: true, min: 5, max: 480 },
    color: { type: String, default: null, trim: true, maxlength: 9 },
    description: { type: String, default: null, trim: true, maxlength: 240 },
    isActive: { type: Boolean, required: true, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'appointmentTypes',
    strict: 'throw',
    minimize: false,
  },
);

/**
 * Names are unique per clinic, case-insensitively: two "Monthly control" rows
 * would make the booking dropdown ambiguous and split the reporting later.
 */
appointmentTypeSchema.index(
  { clinicId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);

/** Drives the booking form, which only ever asks for the active types. */
appointmentTypeSchema.index({ clinicId: 1, isActive: 1, name: 1 });

export const AppointmentTypeModel = model<AppointmentTypeAttributes>(
  'AppointmentType',
  appointmentTypeSchema,
);

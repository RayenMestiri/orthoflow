import { Schema, model } from 'mongoose';
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_VALUES,
  type AppointmentAttributes,
} from './appointment.types.js';

const appointmentSchema = new Schema<AppointmentAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    treatmentId: { type: Schema.Types.ObjectId, ref: 'Treatment', default: null },
    /**
     * MVP: one clinic = one owner-doctor, resolved server-side. The field is
     * stored per appointment so multi-practitioner diaries can arrive later
     * without a migration — but nothing accepts it from a client today.
     */
    doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    appointmentTypeId: { type: Schema.Types.ObjectId, ref: 'AppointmentType', required: true },

    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 5, max: 480 },

    status: {
      type: String,
      required: true,
      enum: APPOINTMENT_STATUS_VALUES,
      default: APPOINTMENT_STATUSES.SCHEDULED,
    },
    note: { type: String, default: null, trim: true, maxlength: 1000 },

    cancellationReason: { type: String, default: null, trim: true, maxlength: 500 },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    arrivedAt: { type: Date, default: null },
    waitingAt: { type: Date, default: null },
    treatmentStartedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    noShowAt: { type: Date, default: null },
    markedNoShowBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    overbookingOverride: { type: Boolean, required: true, default: false },
    overbookingApprovedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    collection: 'appointments',
    strict: 'throw',
    minimize: false,
  },
);

/** The calendar's primary read: one clinic, one visible date range. */
appointmentSchema.index({ clinicId: 1, startAt: 1 });

/** Overlap detection scans the doctor's day: filter by end, sort by start. */
appointmentSchema.index({ clinicId: 1, doctorId: 1, startAt: 1, endAt: 1 });

/** The patient profile's future "appointments" section reads through this. */
appointmentSchema.index({ clinicId: 1, patientId: 1, startAt: -1 });
appointmentSchema.index({ clinicId: 1, treatmentId: 1, startAt: 1 });

export const AppointmentModel = model<AppointmentAttributes>('Appointment', appointmentSchema);

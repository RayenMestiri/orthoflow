import { Schema, model } from 'mongoose';
import {
  TREATMENT_EVENT_TYPE_VALUES,
  TREATMENT_STATUSES,
  TREATMENT_STATUS_VALUES,
  type TreatmentAttributes,
  type TreatmentProgressAttributes,
} from './treatment.types.js';

const treatmentSchema = new Schema<TreatmentAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    /**
     * MVP: one clinic = one owner-doctor, resolved server-side. Stored per
     * treatment so multi-practitioner clinics need no migration later.
     */
    doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    /**
     * Free text rather than a reference: treatment kinds carry no behaviour,
     * and a clinic renaming "Clear aligners" must not orphan historical care.
     */
    treatmentType: { type: String, required: true, trim: true, maxlength: 80 },
    status: {
      type: String,
      required: true,
      enum: TREATMENT_STATUS_VALUES,
      default: TREATMENT_STATUSES.PLANNED,
    },

    startDate: { type: Date, default: null },
    expectedEndDate: { type: Date, default: null },
    actualEndDate: { type: Date, default: null },

    notes: { type: String, default: null, trim: true, maxlength: 2000 },
    totalPlannedCost: { type: Number, default: null, min: 0, max: 1_000_000 },

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

/** The patient profile's primary read: this patient's care, newest first. */
treatmentSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 });

/** Backs the "one live course per patient" check. */
treatmentSchema.index({ clinicId: 1, patientId: 1, status: 1 });

/** Clinic-wide listing, e.g. a future "treatments in progress" report. */
treatmentSchema.index({ clinicId: 1, status: 1, startDate: -1 });

export const TreatmentModel = model<TreatmentAttributes>('Treatment', treatmentSchema);

const treatmentProgressSchema = new Schema<TreatmentProgressAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    treatmentId: { type: Schema.Types.ObjectId, ref: 'Treatment', required: true },

    /** Clinical date, which may differ from when the entry was typed. */
    occurredAt: { type: Date, required: true },
    type: { type: String, required: true, enum: TREATMENT_EVENT_TYPE_VALUES },
    note: { type: String, default: null, trim: true, maxlength: 1000 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'treatmentProgress',
    strict: 'throw',
    minimize: false,
  },
);

/** The timeline: one treatment's events, most recent first. */
treatmentProgressSchema.index({ clinicId: 1, treatmentId: 1, occurredAt: -1 });

/** A patient's whole clinical diary across every course of care. */
treatmentProgressSchema.index({ clinicId: 1, patientId: 1, occurredAt: -1 });

export const TreatmentProgressModel = model<TreatmentProgressAttributes>(
  'TreatmentProgress',
  treatmentProgressSchema,
);

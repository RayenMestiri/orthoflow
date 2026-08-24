import { Schema, model } from 'mongoose';
import {
  PATIENT_MEDIA_CATEGORY_VALUES,
  PATIENT_MEDIA_STATUSES,
  PATIENT_MEDIA_STATUS_VALUES,
  PATIENT_MEDIA_STORAGE_PROVIDERS,
  PATIENT_MEDIA_TYPE_VALUES,
  type PatientMediaAttributes,
} from './patient-media.types.js';

const patientMediaSchema = new Schema<PatientMediaAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, required: true, index: true },
    treatmentId: { type: Schema.Types.ObjectId, default: null, index: true },
    category: { type: String, enum: PATIENT_MEDIA_CATEGORY_VALUES, required: true },
    mediaType: { type: String, enum: PATIENT_MEDIA_TYPE_VALUES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: null, trim: true, maxlength: 1000 },
    storageProvider: {
      type: String,
      enum: Object.values(PATIENT_MEDIA_STORAGE_PROVIDERS),
      required: true,
    },
    publicId: { type: String, required: true, unique: true },
    resourceType: { type: String, required: true },
    deliveryType: {
      type: String,
      enum: ['upload', 'authenticated'],
      default: 'upload',
      required: true,
    },
    secureUrl: { type: String, required: true },
    originalFileName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true, maxlength: 100 },
    fileSizeBytes: { type: Number, required: true, min: 1 },
    format: { type: String, default: null, maxlength: 24 },
    width: { type: Number, default: null, min: 1 },
    height: { type: Number, default: null, min: 1 },
    capturedAt: { type: Date, default: null },
    uploadedAt: { type: Date, required: true },
    uploadedByUserId: { type: Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      enum: PATIENT_MEDIA_STATUS_VALUES,
      default: PATIENT_MEDIA_STATUSES.ACTIVE,
      required: true,
    },
    archivedAt: { type: Date, default: null },
    archivedByUserId: { type: Schema.Types.ObjectId, default: null },
    archiveReason: { type: String, default: null, trim: true, maxlength: 500 },
  },
  {
    collection: 'patientMedia',
    timestamps: true,
    strict: 'throw',
    versionKey: false,
  },
);

patientMediaSchema.index({ clinicId: 1, patientId: 1, status: 1, uploadedAt: -1 });
patientMediaSchema.index({ clinicId: 1, patientId: 1, category: 1, uploadedAt: -1 });
patientMediaSchema.index({ clinicId: 1, treatmentId: 1, uploadedAt: -1 });

export const PatientMediaModel = model<PatientMediaAttributes>('PatientMedia', patientMediaSchema);

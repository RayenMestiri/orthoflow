import { Schema, model } from 'mongoose';
import {
  COMMUNICATION_CHANNEL_VALUES,
  COMMUNICATION_JOB_STATUSES,
  COMMUNICATION_JOB_STATUS_VALUES,
  COMMUNICATION_RECIPIENT_TYPE_VALUES,
  type CommunicationJobAttributes,
} from './communication.types.js';

const communicationJobSchema = new Schema<CommunicationJobAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true },
    sourceEventId: { type: String, required: true, immutable: true, maxlength: 80 },
    eventType: { type: String, required: true, immutable: true, maxlength: 80 },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', default: null, immutable: true },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      immutable: true,
    },
    recipientType: {
      type: String,
      enum: COMMUNICATION_RECIPIENT_TYPE_VALUES,
      required: true,
      immutable: true,
    },
    recipientId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    channel: { type: String, enum: COMMUNICATION_CHANNEL_VALUES, required: true, immutable: true },
    destinationSnapshot: { type: String, required: true, immutable: true, maxlength: 320 },
    destinationMasked: { type: String, required: true, immutable: true, maxlength: 80 },
    templateKey: { type: String, required: true, immutable: true, maxlength: 80 },
    templateVersion: { type: Number, required: true, immutable: true, min: 1 },
    locale: { type: String, enum: ['fr', 'en', 'ar'], required: true, immutable: true },
    payloadSnapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
    status: {
      type: String,
      enum: COMMUNICATION_JOB_STATUS_VALUES,
      default: COMMUNICATION_JOB_STATUSES.PENDING,
      required: true,
    },
    deduplicationKey: { type: String, required: true, immutable: true, maxlength: 420 },
    scheduledFor: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    sentAt: { type: Date, default: null },
    attemptCount: { type: Number, default: 0, min: 0, required: true },
    lastErrorCode: { type: String, default: null, maxlength: 120 },
    lastErrorAt: { type: Date, default: null },
    providerMessageId: { type: String, default: null, maxlength: 300 },
    claimedAt: { type: Date, default: null },
    claimedUntil: { type: Date, default: null },
    claimedBy: { type: String, default: null, maxlength: 120 },
    retryOfJobId: {
      type: Schema.Types.ObjectId,
      ref: 'CommunicationJob',
      default: null,
      immutable: true,
    },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: null, maxlength: 160 },
  },
  { collection: 'communicationJobs', timestamps: true, strict: 'throw', minimize: false },
);
communicationJobSchema.index({ clinicId: 1, deduplicationKey: 1 }, { unique: true });
communicationJobSchema.index({ status: 1, scheduledFor: 1, claimedUntil: 1 });
communicationJobSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 });
communicationJobSchema.index({ clinicId: 1, recipientType: 1, recipientId: 1, createdAt: -1 });
communicationJobSchema.index({ clinicId: 1, status: 1, createdAt: -1 });
communicationJobSchema.index(
  { channel: 1, providerMessageId: 1 },
  { sparse: true, partialFilterExpression: { providerMessageId: { $type: 'string' } } },
);

export const CommunicationJobModel = model<CommunicationJobAttributes>(
  'CommunicationJob',
  communicationJobSchema,
);

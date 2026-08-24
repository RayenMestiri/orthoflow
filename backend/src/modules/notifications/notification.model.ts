import { Schema, model } from 'mongoose';
import {
  NOTIFICATION_PRIORITY_VALUES,
  NOTIFICATION_RECIPIENT_TYPE_VALUES,
  NOTIFICATION_TARGET_VALUES,
  NOTIFICATION_TYPE_VALUES,
  COMMUNICATION_EVENT_TYPE_VALUES,
  OUTBOX_STATUS_VALUES,
  type CommunicationEventAttributes,
  type NotificationAttributes,
} from './notification.types.js';

const notificationContextSchema = new Schema(
  {
    target: { type: String, enum: NOTIFICATION_TARGET_VALUES, required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', default: null },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', default: null },
    consentId: { type: Schema.Types.ObjectId, ref: 'SignedConsent', default: null },
    documentId: { type: Schema.Types.ObjectId, ref: 'GeneratedDocument', default: null },
    treatmentId: { type: Schema.Types.ObjectId, ref: 'Treatment', default: null },
    retentionPlanId: { type: Schema.Types.ObjectId, ref: 'RetentionPlan', default: null },
  },
  { _id: false, strict: 'throw' },
);

const notificationSchema = new Schema<NotificationAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true },
    recipientType: { type: String, enum: NOTIFICATION_RECIPIENT_TYPE_VALUES, required: true },
    recipientId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    sourceEventId: { type: String, required: true, immutable: true, maxlength: 80 },
    type: { type: String, enum: NOTIFICATION_TYPE_VALUES, required: true },
    priority: { type: String, enum: NOTIFICATION_PRIORITY_VALUES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    message: { type: String, required: true, trim: true, maxlength: 280 },
    context: { type: notificationContextSchema, required: true },
    deduplicationKey: { type: String, required: true, maxlength: 300 },
    occurredAt: { type: Date, required: true },
    readAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'notifications', strict: 'throw', minimize: false },
);
notificationSchema.index({ clinicId: 1, recipientType: 1, recipientId: 1, createdAt: -1 });
notificationSchema.index({
  clinicId: 1,
  recipientType: 1,
  recipientId: 1,
  readAt: 1,
  createdAt: -1,
});
notificationSchema.index(
  { clinicId: 1, recipientType: 1, recipientId: 1, deduplicationKey: 1 },
  { unique: true },
);
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const communicationEventSchema = new Schema<CommunicationEventAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true },
    eventId: { type: String, required: true, immutable: true },
    type: { type: String, enum: COMMUNICATION_EVENT_TYPE_VALUES, required: true },
    aggregateType: { type: String, required: true, maxlength: 80 },
    aggregateId: { type: Schema.Types.ObjectId, required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deduplicationKey: { type: String, required: true, maxlength: 300 },
    payload: { type: Schema.Types.Mixed, required: true },
    occurredAt: { type: Date, required: true },
    status: { type: String, enum: OUTBOX_STATUS_VALUES, required: true },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    availableAt: { type: Date, required: true },
    claimedAt: { type: Date, default: null },
    claimedUntil: { type: Date, default: null },
    claimedBy: { type: String, default: null, maxlength: 120 },
    processedAt: { type: Date, default: null },
    lastError: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true, collection: 'communicationOutbox', strict: 'throw', minimize: false },
);
communicationEventSchema.index({ eventId: 1 }, { unique: true });
communicationEventSchema.index({ clinicId: 1, deduplicationKey: 1 }, { unique: true });
communicationEventSchema.index({ status: 1, availableAt: 1, claimedUntil: 1 });
communicationEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 2_592_000 });

export const NotificationModel = model<NotificationAttributes>('Notification', notificationSchema);
export const CommunicationEventModel = model<CommunicationEventAttributes>(
  'CommunicationEvent',
  communicationEventSchema,
);

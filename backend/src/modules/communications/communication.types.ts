import type { Types } from 'mongoose';

export const COMMUNICATION_CHANNELS = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
} as const;
export type CommunicationChannel =
  (typeof COMMUNICATION_CHANNELS)[keyof typeof COMMUNICATION_CHANNELS];
export const COMMUNICATION_CHANNEL_VALUES = Object.values(COMMUNICATION_CHANNELS) as [
  CommunicationChannel,
  ...CommunicationChannel[],
];

export const COMMUNICATION_RECIPIENT_TYPES = { PATIENT: 'PATIENT', GUARDIAN: 'GUARDIAN' } as const;
export type CommunicationRecipientType =
  (typeof COMMUNICATION_RECIPIENT_TYPES)[keyof typeof COMMUNICATION_RECIPIENT_TYPES];
export const COMMUNICATION_RECIPIENT_TYPE_VALUES = Object.values(COMMUNICATION_RECIPIENT_TYPES) as [
  CommunicationRecipientType,
  ...CommunicationRecipientType[],
];

export const COMMUNICATION_JOB_STATUSES = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type CommunicationJobStatus =
  (typeof COMMUNICATION_JOB_STATUSES)[keyof typeof COMMUNICATION_JOB_STATUSES];
export const COMMUNICATION_JOB_STATUS_VALUES = Object.values(COMMUNICATION_JOB_STATUSES) as [
  CommunicationJobStatus,
  ...CommunicationJobStatus[],
];

export const EXTERNAL_EVENT_TYPES = {
  APPOINTMENT_SCHEDULED: 'APPOINTMENT_SCHEDULED',
  APPOINTMENT_CONFIRMED: 'APPOINTMENT_CONFIRMED',
  APPOINTMENT_RESCHEDULED: 'APPOINTMENT_RESCHEDULED',
  APPOINTMENT_CANCELLED: 'APPOINTMENT_CANCELLED',
  APPOINTMENT_NO_SHOW: 'APPOINTMENT_NO_SHOW',
  RECEIPT_AVAILABLE: 'RECEIPT_AVAILABLE',
  CONSENT_SIGNED: 'CONSENT_SIGNED',
  DOCUMENT_SHARED: 'DOCUMENT_SHARED',
  PORTAL_INVITATION: 'PORTAL_INVITATION',
} as const;
export type ExternalEventType = (typeof EXTERNAL_EVENT_TYPES)[keyof typeof EXTERNAL_EVENT_TYPES];

export const TEMPLATE_KEYS = {
  APPOINTMENT_CONFIRMATION: 'APPOINTMENT_CONFIRMATION',
  APPOINTMENT_REMINDER: 'APPOINTMENT_REMINDER',
  APPOINTMENT_CANCELLATION: 'APPOINTMENT_CANCELLATION',
  RECEIPT_AVAILABLE: 'RECEIPT_AVAILABLE',
  CONSENT_SIGNED: 'CONSENT_SIGNED',
  DOCUMENT_SHARED: 'DOCUMENT_SHARED',
  PORTAL_INVITATION: 'PORTAL_INVITATION',
} as const;
export type CommunicationTemplateKey = (typeof TEMPLATE_KEYS)[keyof typeof TEMPLATE_KEYS];

export interface CommunicationJobAttributes {
  clinicId: Types.ObjectId;
  sourceEventId: string;
  eventType: string;
  patientId: Types.ObjectId | null;
  appointmentId: Types.ObjectId | null;
  recipientType: CommunicationRecipientType;
  recipientId: Types.ObjectId;
  channel: CommunicationChannel;
  destinationSnapshot: string;
  destinationMasked: string;
  templateKey: CommunicationTemplateKey;
  templateVersion: number;
  locale: 'fr' | 'en' | 'ar';
  payloadSnapshot: Record<string, string | null>;
  status: CommunicationJobStatus;
  deduplicationKey: string;
  scheduledFor: Date;
  expiresAt: Date;
  sentAt: Date | null;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorAt: Date | null;
  providerMessageId: string | null;
  claimedAt: Date | null;
  claimedUntil: Date | null;
  claimedBy: string | null;
  retryOfJobId: Types.ObjectId | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export type CommunicationJobRecord = CommunicationJobAttributes & { _id: Types.ObjectId };

export interface CreateCommunicationJobInput {
  clinicId: string;
  sourceEventId: string;
  eventType: string;
  patientId?: string | null;
  appointmentId?: string | null;
  recipientType: CommunicationRecipientType;
  recipientId: string;
  channel: CommunicationChannel;
  destinationSnapshot: string;
  destinationMasked: string;
  templateKey: CommunicationTemplateKey;
  templateVersion: number;
  locale: 'fr' | 'en' | 'ar';
  payloadSnapshot: Record<string, string | null>;
  deduplicationKey: string;
  scheduledFor: Date;
  expiresAt: Date;
  retryOfJobId?: string | null;
}

export interface CommunicationJobDto {
  id: string;
  eventType: string;
  patientId: string | null;
  appointmentId: string | null;
  recipientType: CommunicationRecipientType;
  recipientId: string;
  channel: CommunicationChannel;
  destinationMasked: string;
  templateKey: CommunicationTemplateKey;
  status: CommunicationJobStatus;
  scheduledFor: string;
  sentAt: string | null;
  attemptCount: number;
  lastErrorCode: string | null;
  retryOfJobId: string | null;
  createdAt: string;
}

export interface ChannelSendRequest {
  destination: string;
  subject: string | null;
  text: string;
  html: string | null;
  idempotencyKey: string;
}
export interface ChannelSendResult {
  providerMessageId: string | null;
  acceptedAt: Date;
}

export class ChannelDeliveryError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = 'ChannelDeliveryError';
  }
}

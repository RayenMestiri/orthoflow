import type { Types } from 'mongoose';
import { EXTERNAL_EVENT_TYPES, type ExternalEventType } from '../communications/communication.types.js';

export const NOTIFICATION_RECIPIENT_TYPES = {
  STAFF: 'STAFF',
  PORTAL_USER: 'PORTAL_USER',
} as const;
export type NotificationRecipientType =
  (typeof NOTIFICATION_RECIPIENT_TYPES)[keyof typeof NOTIFICATION_RECIPIENT_TYPES];
export const NOTIFICATION_RECIPIENT_TYPE_VALUES = Object.values(NOTIFICATION_RECIPIENT_TYPES) as [
  NotificationRecipientType,
  ...NotificationRecipientType[],
];

export const NOTIFICATION_TYPES = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_REASSIGNED: 'TASK_REASSIGNED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  APPOINTMENT_CANCELLED: 'APPOINTMENT_CANCELLED',
  APPOINTMENT_NO_SHOW: 'APPOINTMENT_NO_SHOW',
  CONSENT_SIGNED: 'CONSENT_SIGNED',
  GENERATED_DOCUMENT_READY: 'GENERATED_DOCUMENT_READY',
  CARE_CONTINUITY_ATTENTION: 'CARE_CONTINUITY_ATTENTION',
} as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
export const NOTIFICATION_TYPE_VALUES = Object.values(NOTIFICATION_TYPES) as [
  NotificationType,
  ...NotificationType[],
];
export type CommunicationEventType = NotificationType | ExternalEventType;
export const COMMUNICATION_EVENT_TYPE_VALUES = [
  ...new Set([...NOTIFICATION_TYPE_VALUES, ...Object.values(EXTERNAL_EVENT_TYPES)]),
] as [CommunicationEventType, ...CommunicationEventType[]];

export const NOTIFICATION_PRIORITIES = { NORMAL: 'NORMAL', IMPORTANT: 'IMPORTANT' } as const;
export type NotificationPriority =
  (typeof NOTIFICATION_PRIORITIES)[keyof typeof NOTIFICATION_PRIORITIES];
export const NOTIFICATION_PRIORITY_VALUES = Object.values(NOTIFICATION_PRIORITIES) as [
  NotificationPriority,
  ...NotificationPriority[],
];

export const NOTIFICATION_TARGETS = {
  TASK: 'TASK',
  APPOINTMENT: 'APPOINTMENT',
  PATIENT_CONSENTS: 'PATIENT_CONSENTS',
  PATIENT_DOCUMENTS: 'PATIENT_DOCUMENTS',
  CARE_CONTINUITY: 'CARE_CONTINUITY',
} as const;
export type NotificationTarget = (typeof NOTIFICATION_TARGETS)[keyof typeof NOTIFICATION_TARGETS];
export const NOTIFICATION_TARGET_VALUES = Object.values(NOTIFICATION_TARGETS) as [
  NotificationTarget,
  ...NotificationTarget[],
];

export interface NotificationContextAttributes {
  target: NotificationTarget;
  patientId: Types.ObjectId | null;
  taskId: Types.ObjectId | null;
  appointmentId: Types.ObjectId | null;
  consentId: Types.ObjectId | null;
  documentId: Types.ObjectId | null;
  treatmentId: Types.ObjectId | null;
  retentionPlanId: Types.ObjectId | null;
}

export interface NotificationAttributes {
  clinicId: Types.ObjectId;
  recipientType: NotificationRecipientType;
  recipientId: Types.ObjectId;
  sourceEventId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  context: NotificationContextAttributes;
  deduplicationKey: string;
  occurredAt: Date;
  readAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationRecord = NotificationAttributes & { _id: Types.ObjectId };

export interface NotificationContextDto {
  target: NotificationTarget;
  patientId: string | null;
  taskId: string | null;
  appointmentId: string | null;
  consentId: string | null;
  documentId: string | null;
  treatmentId: string | null;
  retentionPlanId: string | null;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  context: NotificationContextDto;
  occurredAt: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListFilters {
  filter?: 'ALL' | 'UNREAD';
}

export const OUTBOX_STATUSES = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
} as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[keyof typeof OUTBOX_STATUSES];
export const OUTBOX_STATUS_VALUES = Object.values(OUTBOX_STATUSES) as [
  OutboxStatus,
  ...OutboxStatus[],
];

export interface CommunicationEventAttributes {
  clinicId: Types.ObjectId;
  eventId: string;
  type: CommunicationEventType;
  aggregateType: string;
  aggregateId: Types.ObjectId;
  actorUserId: Types.ObjectId | null;
  deduplicationKey: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  status: OutboxStatus;
  attempts: number;
  availableAt: Date;
  claimedAt: Date | null;
  claimedUntil: Date | null;
  claimedBy: string | null;
  processedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CommunicationEventRecord = CommunicationEventAttributes & { _id: Types.ObjectId };

export interface EnqueueCommunicationEventInput {
  clinicId: string;
  type: CommunicationEventType;
  aggregateType: string;
  aggregateId: string;
  actorUserId?: string | null;
  deduplicationKey: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
}

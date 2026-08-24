import { randomUUID } from 'node:crypto';
import type { ClientSession, QueryFilter } from 'mongoose';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { CommunicationEventModel, NotificationModel } from './notification.model.js';
import {
  NOTIFICATION_RECIPIENT_TYPES,
  OUTBOX_STATUSES,
  type CommunicationEventRecord,
  type EnqueueCommunicationEventInput,
  type NotificationAttributes,
  type NotificationListFilters,
  type NotificationRecord,
} from './notification.types.js';

const UNREAD_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
const READ_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

export interface CreateRecipientNotificationInput {
  clinicId: string;
  recipientId: string;
  sourceEventId: string;
  type: NotificationAttributes['type'];
  priority: NotificationAttributes['priority'];
  title: string;
  message: string;
  context: {
    target: NotificationAttributes['context']['target'];
    patientId?: string | null;
    taskId?: string | null;
    appointmentId?: string | null;
    consentId?: string | null;
    documentId?: string | null;
    treatmentId?: string | null;
    retentionPlanId?: string | null;
  };
  deduplicationKey: string;
  occurredAt: Date;
}

function optionalObjectId(value: string | null | undefined, field: string) {
  return value ? toObjectId(value, field) : null;
}

export class NotificationRepository {
  async createForRecipient(input: CreateRecipientNotificationInput): Promise<void> {
    const expiresAt = new Date(input.occurredAt.getTime() + UNREAD_RETENTION_MS);
    await NotificationModel.updateOne(
      {
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        recipientType: NOTIFICATION_RECIPIENT_TYPES.STAFF,
        recipientId: toObjectId(input.recipientId, 'recipientId'),
        deduplicationKey: input.deduplicationKey,
      },
      {
        $setOnInsert: {
          sourceEventId: input.sourceEventId,
          type: input.type,
          priority: input.priority,
          title: input.title,
          message: input.message,
          context: {
            target: input.context.target,
            patientId: optionalObjectId(input.context.patientId, 'patientId'),
            taskId: optionalObjectId(input.context.taskId, 'taskId'),
            appointmentId: optionalObjectId(input.context.appointmentId, 'appointmentId'),
            consentId: optionalObjectId(input.context.consentId, 'consentId'),
            documentId: optionalObjectId(input.context.documentId, 'documentId'),
            treatmentId: optionalObjectId(input.context.treatmentId, 'treatmentId'),
            retentionPlanId: optionalObjectId(input.context.retentionPlanId, 'retentionPlanId'),
          },
          occurredAt: input.occurredAt,
          readAt: null,
          expiresAt,
        },
      },
      { upsert: true, runValidators: true },
    ).exec();
  }

  async listForStaff(
    clinicId: string,
    recipientId: string,
    filters: NotificationListFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<NotificationRecord>> {
    const query: QueryFilter<NotificationAttributes> = {
      clinicId: toObjectId(clinicId, 'clinicId'),
      recipientType: NOTIFICATION_RECIPIENT_TYPES.STAFF,
      recipientId: toObjectId(recipientId, 'recipientId'),
    };
    if (filters.filter === 'UNREAD') query.readAt = null;

    const [items, total] = await Promise.all([
      NotificationModel.find(query)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<NotificationRecord[]>()
        .exec(),
      NotificationModel.countDocuments(query).exec(),
    ]);
    return { items, total };
  }

  async countUnreadForStaff(clinicId: string, recipientId: string): Promise<number> {
    return NotificationModel.countDocuments({
      clinicId: toObjectId(clinicId, 'clinicId'),
      recipientType: NOTIFICATION_RECIPIENT_TYPES.STAFF,
      recipientId: toObjectId(recipientId, 'recipientId'),
      readAt: null,
    }).exec();
  }

  async markReadForStaff(
    clinicId: string,
    recipientId: string,
    notificationId: string,
    at: Date,
  ): Promise<NotificationRecord | null> {
    const scope = {
      _id: toObjectId(notificationId, 'notificationId'),
      clinicId: toObjectId(clinicId, 'clinicId'),
      recipientType: NOTIFICATION_RECIPIENT_TYPES.STAFF,
      recipientId: toObjectId(recipientId, 'recipientId'),
    } as const;
    const updated = await NotificationModel.findOneAndUpdate(
      { ...scope, readAt: null },
      {
        $set: {
          readAt: at,
          expiresAt: new Date(at.getTime() + READ_RETENTION_MS),
        },
      },
      { new: true, runValidators: true },
    )
      .lean<NotificationRecord | null>()
      .exec();
    if (updated) return updated;

    // Repeated requests are idempotent and do not extend read-notification retention.
    return NotificationModel.findOne(scope).lean<NotificationRecord | null>().exec();
  }

  async markAllReadForStaff(clinicId: string, recipientId: string, at: Date): Promise<number> {
    const result = await NotificationModel.updateMany(
      {
        clinicId: toObjectId(clinicId, 'clinicId'),
        recipientType: NOTIFICATION_RECIPIENT_TYPES.STAFF,
        recipientId: toObjectId(recipientId, 'recipientId'),
        readAt: null,
      },
      { $set: { readAt: at, expiresAt: new Date(at.getTime() + READ_RETENTION_MS) } },
    ).exec();
    return result.modifiedCount;
  }
}

export class CommunicationOutboxRepository {
  async enqueue(input: EnqueueCommunicationEventInput, session?: ClientSession): Promise<void> {
    const occurredAt = input.occurredAt ?? new Date();
    await CommunicationEventModel.updateOne(
      {
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        deduplicationKey: input.deduplicationKey,
      },
      {
        $setOnInsert: {
          eventId: randomUUID(),
          type: input.type,
          aggregateType: input.aggregateType,
          aggregateId: toObjectId(input.aggregateId, 'aggregateId'),
          actorUserId: optionalObjectId(input.actorUserId, 'actorUserId'),
          payload: input.payload,
          occurredAt,
          status: OUTBOX_STATUSES.PENDING,
          attempts: 0,
          availableAt: occurredAt,
          claimedAt: null,
          claimedUntil: null,
          claimedBy: null,
          processedAt: null,
          lastError: null,
        },
      },
      { upsert: true, runValidators: true, session },
    ).exec();
  }

  async claimNext(
    workerId: string,
    now: Date,
    leaseMs: number,
  ): Promise<CommunicationEventRecord | null> {
    return CommunicationEventModel.findOneAndUpdate(
      {
        status: { $in: [OUTBOX_STATUSES.PENDING, OUTBOX_STATUSES.PROCESSING] },
        availableAt: { $lte: now },
        $or: [{ claimedUntil: null }, { claimedUntil: { $lte: now } }],
      },
      {
        $set: {
          status: OUTBOX_STATUSES.PROCESSING,
          claimedAt: now,
          claimedUntil: new Date(now.getTime() + leaseMs),
          claimedBy: workerId,
        },
        $inc: { attempts: 1 },
      },
      { new: true, sort: { availableAt: 1, createdAt: 1 } },
    )
      .lean<CommunicationEventRecord | null>()
      .exec();
  }

  async markProcessed(eventId: string, workerId: string, at: Date): Promise<void> {
    await CommunicationEventModel.updateOne(
      { eventId, claimedBy: workerId, status: OUTBOX_STATUSES.PROCESSING },
      {
        $set: {
          status: OUTBOX_STATUSES.PROCESSED,
          processedAt: at,
          claimedAt: null,
          claimedUntil: null,
          claimedBy: null,
          lastError: null,
        },
      },
    ).exec();
  }

  async markFailed(
    eventId: string,
    workerId: string,
    attempts: number,
    error: string,
    at: Date,
  ): Promise<void> {
    const terminal = attempts >= 10;
    const delayMs = Math.min(60_000 * 2 ** Math.max(attempts - 1, 0), 60 * 60 * 1000);
    await CommunicationEventModel.updateOne(
      { eventId, claimedBy: workerId, status: OUTBOX_STATUSES.PROCESSING },
      {
        $set: {
          status: terminal ? OUTBOX_STATUSES.FAILED : OUTBOX_STATUSES.PENDING,
          availableAt: new Date(at.getTime() + delayMs),
          claimedAt: null,
          claimedUntil: null,
          claimedBy: null,
          lastError: error.slice(0, 1000),
        },
      },
    ).exec();
  }
}

export const notificationRepository = new NotificationRepository();
export const communicationOutboxRepository = new CommunicationOutboxRepository();

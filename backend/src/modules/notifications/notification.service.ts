import type { ClientSession } from 'mongoose';
import { NotFoundError } from '../../common/errors/app-error.js';
import { toPaginationParams } from '../../common/utils/pagination.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import {
  communicationOutboxRepository,
  notificationRepository,
  type CommunicationOutboxRepository,
  type NotificationRepository,
} from './notification.repository.js';
import type {
  EnqueueCommunicationEventInput,
  NotificationDto,
  NotificationListFilters,
  NotificationRecord,
} from './notification.types.js';

export function toNotificationDto(record: NotificationRecord): NotificationDto {
  const id = (value: { toString(): string } | null) => value?.toString() ?? null;
  return {
    id: record._id.toString(),
    type: record.type,
    priority: record.priority,
    title: record.title,
    message: record.message,
    context: {
      target: record.context.target,
      patientId: id(record.context.patientId),
      taskId: id(record.context.taskId),
      appointmentId: id(record.context.appointmentId),
      consentId: id(record.context.consentId),
      documentId: id(record.context.documentId),
      treatmentId: id(record.context.treatmentId),
      retentionPlanId: id(record.context.retentionPlanId),
    },
    occurredAt: record.occurredAt.toISOString(),
    readAt: record.readAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export class CommunicationEventService {
  constructor(
    private readonly outbox: CommunicationOutboxRepository = communicationOutboxRepository,
  ) {}

  async enqueue(input: EnqueueCommunicationEventInput, session?: ClientSession): Promise<void> {
    await this.outbox.enqueue(input, session);
  }
}

export class NotificationService {
  constructor(private readonly notifications: NotificationRepository = notificationRepository) {}

  async listForStaff(
    clinicId: string,
    userId: string,
    filters: NotificationListFilters,
    page: { page?: number; limit?: number },
  ): Promise<{ result: PaginatedResult<NotificationDto>; pagination: PaginationParams }> {
    const pagination = toPaginationParams(page);
    const result = await this.notifications.listForStaff(clinicId, userId, filters, pagination);
    return {
      result: { items: result.items.map(toNotificationDto), total: result.total },
      pagination,
    };
  }

  async unreadCount(clinicId: string, userId: string): Promise<number> {
    return this.notifications.countUnreadForStaff(clinicId, userId);
  }

  async markRead(
    clinicId: string,
    userId: string,
    notificationId: string,
  ): Promise<NotificationDto> {
    const record = await this.notifications.markReadForStaff(
      clinicId,
      userId,
      notificationId,
      new Date(),
    );
    if (!record) throw new NotFoundError('Notification not found');
    return toNotificationDto(record);
  }

  async markAllRead(
    clinicId: string,
    userId: string,
  ): Promise<{ updatedCount: number; readAt: string }> {
    const at = new Date();
    const updatedCount = await this.notifications.markAllReadForStaff(clinicId, userId, at);
    return { updatedCount, readAt: at.toISOString() };
  }
}

export const communicationEventService = new CommunicationEventService();
export const notificationService = new NotificationService();

import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../src/common/errors/app-error.js';
import { NotificationService } from '../../src/modules/notifications/notification.service.js';
import type { NotificationRepository } from '../../src/modules/notifications/notification.repository.js';
import {
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_RECIPIENT_TYPES,
  NOTIFICATION_TARGETS,
  NOTIFICATION_TYPES,
  type NotificationRecord,
} from '../../src/modules/notifications/notification.types.js';

const CLINIC_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();

function record(readAt: Date | null = null): NotificationRecord {
  const now = new Date('2026-08-24T09:00:00.000Z');
  return {
    _id: new Types.ObjectId(),
    clinicId: new Types.ObjectId(CLINIC_ID),
    recipientType: NOTIFICATION_RECIPIENT_TYPES.STAFF,
    recipientId: new Types.ObjectId(USER_ID),
    sourceEventId: 'event-1',
    type: NOTIFICATION_TYPES.TASK_ASSIGNED,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    title: 'New task assigned',
    message: 'Call patient',
    context: {
      target: NOTIFICATION_TARGETS.TASK,
      patientId: null,
      taskId: new Types.ObjectId(),
      appointmentId: null,
      consentId: null,
      documentId: null,
      treatmentId: null,
      retentionPlanId: null,
    },
    deduplicationKey: 'task-1',
    occurredAt: now,
    readAt,
    expiresAt: new Date('2027-08-24T09:00:00.000Z'),
    createdAt: now,
    updatedAt: now,
  };
}

describe('NotificationService', () => {
  let repository: {
    listForStaff: ReturnType<typeof vi.fn>;
    countUnreadForStaff: ReturnType<typeof vi.fn>;
    markReadForStaff: ReturnType<typeof vi.fn>;
    markAllReadForStaff: ReturnType<typeof vi.fn>;
  };
  let service: NotificationService;

  beforeEach(() => {
    repository = {
      listForStaff: vi.fn(),
      countUnreadForStaff: vi.fn(),
      markReadForStaff: vi.fn(),
      markAllReadForStaff: vi.fn(),
    };
    service = new NotificationService(repository as unknown as NotificationRepository);
  });

  it('lists and maps only the requested staff recipient', async () => {
    repository.listForStaff.mockResolvedValue({ items: [record()], total: 1 });

    const result = await service.listForStaff(
      CLINIC_ID,
      USER_ID,
      { filter: 'UNREAD' },
      { page: 2, limit: 10 },
    );

    expect(repository.listForStaff).toHaveBeenCalledWith(
      CLINIC_ID,
      USER_ID,
      { filter: 'UNREAD' },
      { page: 2, limit: 10, skip: 10 },
    );
    expect(result.result.items[0]).toMatchObject({
      type: NOTIFICATION_TYPES.TASK_ASSIGNED,
      readAt: null,
      context: { target: NOTIFICATION_TARGETS.TASK },
    });
  });

  it('returns the current recipient unread count', async () => {
    repository.countUnreadForStaff.mockResolvedValue(7);
    await expect(service.unreadCount(CLINIC_ID, USER_ID)).resolves.toBe(7);
    expect(repository.countUnreadForStaff).toHaveBeenCalledWith(CLINIC_ID, USER_ID);
  });

  it('marks one scoped notification read and rejects inaccessible ids', async () => {
    const readAt = new Date('2026-08-24T10:00:00.000Z');
    repository.markReadForStaff.mockResolvedValueOnce(record(readAt)).mockResolvedValueOnce(null);

    await expect(
      service.markRead(CLINIC_ID, USER_ID, new Types.ObjectId().toString()),
    ).resolves.toMatchObject({
      readAt: readAt.toISOString(),
    });
    await expect(
      service.markRead(CLINIC_ID, USER_ID, new Types.ObjectId().toString()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('marks all unread notifications for only the current recipient', async () => {
    repository.markAllReadForStaff.mockResolvedValue(3);
    const result = await service.markAllRead(CLINIC_ID, USER_ID);
    expect(repository.markAllReadForStaff).toHaveBeenCalledWith(
      CLINIC_ID,
      USER_ID,
      expect.any(Date),
    );
    expect(result).toMatchObject({ updatedCount: 3, readAt: expect.any(String) });
  });
});

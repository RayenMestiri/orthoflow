import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationDispatcher } from '../../src/modules/notifications/notification.dispatcher.js';
import type { MembershipRepository } from '../../src/modules/memberships/membership.repository.js';
import type { UserRepository } from '../../src/modules/users/user.repository.js';
import type {
  CreateRecipientNotificationInput,
  NotificationRepository,
} from '../../src/modules/notifications/notification.repository.js';
import {
  NOTIFICATION_TARGETS,
  NOTIFICATION_TYPES,
  OUTBOX_STATUSES,
  type CommunicationEventRecord,
} from '../../src/modules/notifications/notification.types.js';

const CLINIC_ID = new Types.ObjectId();
const OWNER_ID = new Types.ObjectId();
const DOCTOR_ID = new Types.ObjectId();
const SECRETARY_ID = new Types.ObjectId();
const ASSISTANT_ID = new Types.ObjectId();

function event(
  type: CommunicationEventRecord['type'],
  payload: Record<string, unknown>,
  actorUserId: Types.ObjectId | null = OWNER_ID,
): CommunicationEventRecord {
  const at = new Date('2026-08-24T09:00:00.000Z');
  return {
    _id: new Types.ObjectId(),
    clinicId: CLINIC_ID,
    eventId: 'event-1',
    type,
    aggregateType: 'TASK',
    aggregateId: new Types.ObjectId(),
    actorUserId,
    deduplicationKey: `dedup:${type}`,
    payload,
    occurredAt: at,
    status: OUTBOX_STATUSES.PROCESSING,
    attempts: 1,
    availableAt: at,
    claimedAt: at,
    claimedUntil: at,
    claimedBy: 'worker',
    processedAt: null,
    lastError: null,
    createdAt: at,
    updatedAt: at,
  };
}

describe('NotificationDispatcher', () => {
  let notifications: { createForRecipient: ReturnType<typeof vi.fn> };
  let memberships: { findActiveByClinic: ReturnType<typeof vi.fn> };
  let users: { findManyByIds: ReturnType<typeof vi.fn> };
  let dispatcher: NotificationDispatcher;

  beforeEach(() => {
    notifications = { createForRecipient: vi.fn().mockResolvedValue(undefined) };
    memberships = {
      findActiveByClinic: vi.fn().mockResolvedValue([
        { userId: OWNER_ID, role: 'CLINIC_OWNER', status: 'ACTIVE' },
        { userId: DOCTOR_ID, role: 'ORTHODONTIST', status: 'ACTIVE' },
        { userId: SECRETARY_ID, role: 'SECRETARY', status: 'ACTIVE' },
        { userId: ASSISTANT_ID, role: 'ASSISTANT', status: 'ACTIVE' },
      ]),
    };
    users = {
      findManyByIds: vi.fn().mockResolvedValue(
        [OWNER_ID, DOCTOR_ID, SECRETARY_ID, ASSISTANT_ID].map((_id) => ({
          _id,
          status: 'ACTIVE',
        })),
      ),
    };
    dispatcher = new NotificationDispatcher(
      notifications as unknown as NotificationRepository,
      memberships as unknown as MembershipRepository,
      users as unknown as UserRepository,
    );
  });

  it('notifies the active eligible task assignee with navigation context', async () => {
    const taskEvent = event(NOTIFICATION_TYPES.TASK_ASSIGNED, {
      assignedToUserId: DOCTOR_ID.toString(),
      taskTitle: 'Review scan',
      patientId: new Types.ObjectId().toString(),
    });

    await dispatcher.dispatch(taskEvent);

    expect(notifications.createForRecipient).toHaveBeenCalledTimes(1);
    expect(notifications.createForRecipient).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: DOCTOR_ID.toString(),
        title: 'New task assigned',
        message: 'Review scan',
        deduplicationKey: taskEvent.deduplicationKey,
        context: expect.objectContaining({ target: NOTIFICATION_TARGETS.TASK }),
      }),
    );
  });

  it('notifies the assigned doctor and secretaries for cancellation, excluding the actor', async () => {
    await dispatcher.dispatch(
      event(NOTIFICATION_TYPES.APPOINTMENT_CANCELLED, {
        doctorId: DOCTOR_ID.toString(),
        patientName: 'Amira Ben Ali',
        scheduledLabel: '10:30',
      }),
    );

    const recipients = notifications.createForRecipient.mock.calls.map(
      ([input]) => (input as CreateRecipientNotificationInput).recipientId,
    );
    expect(recipients).toEqual(
      expect.arrayContaining([DOCTOR_ID.toString(), SECRETARY_ID.toString()]),
    );
    expect(recipients).not.toContain(OWNER_ID.toString());
    expect(recipients).not.toContain(ASSISTANT_ID.toString());
  });

  it('filters inactive users and preserves the explicit self-notification for generated documents', async () => {
    users.findManyByIds.mockResolvedValue([
      { _id: OWNER_ID, status: 'ACTIVE' },
      { _id: DOCTOR_ID, status: 'INACTIVE' },
      { _id: SECRETARY_ID, status: 'ACTIVE' },
      { _id: ASSISTANT_ID, status: 'ACTIVE' },
    ]);

    await dispatcher.dispatch(
      event(
        NOTIFICATION_TYPES.GENERATED_DOCUMENT_READY,
        { generatedByUserId: OWNER_ID.toString(), documentTitle: 'Treatment summary' },
        OWNER_ID,
      ),
    );

    expect(notifications.createForRecipient).toHaveBeenCalledOnce();
    expect(notifications.createForRecipient).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: OWNER_ID.toString(),
        title: 'Generated document ready',
      }),
    );
  });

  it('does not notify a task actor about their own assignment', async () => {
    await dispatcher.dispatch(
      event(NOTIFICATION_TYPES.TASK_ASSIGNED, { assignedToUserId: OWNER_ID.toString() }, OWNER_ID),
    );
    expect(notifications.createForRecipient).not.toHaveBeenCalled();
  });
});

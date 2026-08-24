import { ROLE_PERMISSIONS, type Permission } from '../../common/constants/permissions.js';
import { MEMBERSHIP_STATUSES } from '../../common/constants/roles.js';
import {
  membershipRepository,
  type MembershipRepository,
} from '../memberships/membership.repository.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import { USER_STATUSES } from '../users/user.types.js';
import {
  notificationRepository,
  type CreateRecipientNotificationInput,
  type NotificationRepository,
} from './notification.repository.js';
import {
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_TARGETS,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_VALUES,
  type NotificationType,
  type CommunicationEventRecord,
} from './notification.types.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';

type Payload = Record<string, unknown>;

function text(payload: Payload, key: string, fallback: string): string {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function optional(payload: Payload, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value ? value : null;
}

function requiredPermission(type: NotificationType): Permission {
  switch (type) {
    case NOTIFICATION_TYPES.TASK_ASSIGNED:
    case NOTIFICATION_TYPES.TASK_REASSIGNED:
    case NOTIFICATION_TYPES.TASK_COMPLETED:
      return PERMISSIONS.TASK_READ;
    case NOTIFICATION_TYPES.APPOINTMENT_CANCELLED:
    case NOTIFICATION_TYPES.APPOINTMENT_NO_SHOW:
      return PERMISSIONS.APPOINTMENT_READ;
    case NOTIFICATION_TYPES.CONSENT_SIGNED:
      return PERMISSIONS.CONSENT_READ;
    case NOTIFICATION_TYPES.GENERATED_DOCUMENT_READY:
      return PERMISSIONS.GENERATED_DOCUMENT_READ;
    case NOTIFICATION_TYPES.CARE_CONTINUITY_ATTENTION:
      return PERMISSIONS.FOLLOW_UP_READ;
  }
}

export class NotificationDispatcher {
  constructor(
    private readonly notifications: NotificationRepository = notificationRepository,
    private readonly memberships: MembershipRepository = membershipRepository,
    private readonly users: UserRepository = userRepository,
  ) {}

  async dispatch(event: CommunicationEventRecord): Promise<void> {
    if (!NOTIFICATION_TYPE_VALUES.includes(event.type as NotificationType)) return;
    const internalEvent = event as CommunicationEventRecord & { type: NotificationType };
    const clinicId = event.clinicId.toString();
    const actorId = event.actorUserId?.toString() ?? null;
    const memberships = await this.memberships.findActiveByClinic(clinicId);
    const userIds = memberships.map((membership) => membership.userId.toString());
    const users = await this.users.findManyByIds(userIds);
    const activeUsers = new Set(
      users
        .filter((user) => user.status === USER_STATUSES.ACTIVE)
        .map((user) => user._id.toString()),
    );
    const permission = requiredPermission(internalEvent.type);
    const eligible = memberships.filter(
      (membership) =>
        membership.status === MEMBERSHIP_STATUSES.ACTIVE &&
        activeUsers.has(membership.userId.toString()) &&
        ROLE_PERMISSIONS[membership.role].includes(permission),
    );
    const recipientIds = this.resolveRecipientIds(
      internalEvent,
      eligible.map((membership) => ({
        userId: membership.userId.toString(),
        role: membership.role,
      })),
    );

    const display = this.render(internalEvent);
    await Promise.all(
      recipientIds.map((recipientId) =>
        this.notifications.createForRecipient({
          clinicId,
          recipientId,
          sourceEventId: event.eventId,
          type: internalEvent.type,
          priority: display.priority,
          title: display.title,
          message: display.message,
          context: display.context,
          deduplicationKey: event.deduplicationKey,
          occurredAt: event.occurredAt,
        }),
      ),
    );

    // Self-notifications are intentionally excluded by policy, except document
    // generation: its recipient is explicitly the generator and signals that the
    // persisted artifact is available after the storage transaction completed.
    void actorId;
  }

  private resolveRecipientIds(
    event: CommunicationEventRecord & { type: NotificationType },
    eligible: Array<{ userId: string; role: string }>,
  ): string[] {
    const payload = event.payload;
    const actorId = event.actorUserId?.toString() ?? null;
    const allowed = new Set(eligible.map((member) => member.userId));
    let candidates: string[] = [];

    switch (event.type) {
      case NOTIFICATION_TYPES.TASK_ASSIGNED:
      case NOTIFICATION_TYPES.TASK_REASSIGNED:
        candidates = [optional(payload, 'assignedToUserId')].filter((id): id is string =>
          Boolean(id),
        );
        break;
      case NOTIFICATION_TYPES.TASK_COMPLETED:
        candidates = [optional(payload, 'createdByUserId')].filter((id): id is string =>
          Boolean(id),
        );
        break;
      case NOTIFICATION_TYPES.APPOINTMENT_CANCELLED:
      case NOTIFICATION_TYPES.APPOINTMENT_NO_SHOW: {
        const doctorId = optional(payload, 'doctorId');
        const secretaryIds = eligible
          .filter((member) => member.role === 'SECRETARY')
          .map((member) => member.userId);
        candidates = [...(doctorId ? [doctorId] : []), ...secretaryIds];
        break;
      }
      case NOTIFICATION_TYPES.CONSENT_SIGNED:
        candidates = eligible
          .filter((member) => ['CLINIC_OWNER', 'ORTHODONTIST', 'DENTIST'].includes(member.role))
          .map((member) => member.userId);
        break;
      case NOTIFICATION_TYPES.GENERATED_DOCUMENT_READY:
        candidates = [optional(payload, 'generatedByUserId')].filter((id): id is string =>
          Boolean(id),
        );
        break;
      case NOTIFICATION_TYPES.CARE_CONTINUITY_ATTENTION:
        candidates = eligible.map((member) => member.userId);
        break;
    }

    return [...new Set(candidates)].filter(
      (id) =>
        allowed.has(id) &&
        (event.type === NOTIFICATION_TYPES.GENERATED_DOCUMENT_READY || id !== actorId),
    );
  }

  private render(
    event: CommunicationEventRecord & { type: NotificationType },
  ): Omit<
    CreateRecipientNotificationInput,
    'clinicId' | 'recipientId' | 'sourceEventId' | 'type' | 'deduplicationKey' | 'occurredAt'
  > {
    const payload = event.payload;
    const patientName = text(payload, 'patientName', 'Patient');
    switch (event.type) {
      case NOTIFICATION_TYPES.TASK_ASSIGNED:
        return {
          priority: NOTIFICATION_PRIORITIES.NORMAL,
          title: 'New task assigned',
          message: text(payload, 'taskTitle', 'A clinic task was assigned to you.'),
          context: {
            target: NOTIFICATION_TARGETS.TASK,
            taskId: event.aggregateId.toString(),
            patientId: optional(payload, 'patientId'),
          },
        };
      case NOTIFICATION_TYPES.TASK_REASSIGNED:
        return {
          priority: NOTIFICATION_PRIORITIES.NORMAL,
          title: 'Task reassigned to you',
          message: text(payload, 'taskTitle', 'A clinic task was reassigned to you.'),
          context: {
            target: NOTIFICATION_TARGETS.TASK,
            taskId: event.aggregateId.toString(),
            patientId: optional(payload, 'patientId'),
          },
        };
      case NOTIFICATION_TYPES.TASK_COMPLETED:
        return {
          priority: NOTIFICATION_PRIORITIES.NORMAL,
          title: 'Task completed',
          message: `${text(payload, 'completedByName', 'A team member')} completed ${text(payload, 'taskTitle', 'a task')}.`,
          context: {
            target: NOTIFICATION_TARGETS.TASK,
            taskId: event.aggregateId.toString(),
            patientId: optional(payload, 'patientId'),
          },
        };
      case NOTIFICATION_TYPES.APPOINTMENT_CANCELLED:
        return {
          priority: NOTIFICATION_PRIORITIES.IMPORTANT,
          title: 'Appointment cancelled',
          message: `${patientName} · ${text(payload, 'scheduledLabel', 'Scheduled appointment')}`,
          context: {
            target: NOTIFICATION_TARGETS.APPOINTMENT,
            appointmentId: event.aggregateId.toString(),
            patientId: optional(payload, 'patientId'),
          },
        };
      case NOTIFICATION_TYPES.APPOINTMENT_NO_SHOW:
        return {
          priority: NOTIFICATION_PRIORITIES.IMPORTANT,
          title: 'Patient marked no-show',
          message: `${patientName} · ${text(payload, 'scheduledLabel', 'Scheduled appointment')}`,
          context: {
            target: NOTIFICATION_TARGETS.APPOINTMENT,
            appointmentId: event.aggregateId.toString(),
            patientId: optional(payload, 'patientId'),
          },
        };
      case NOTIFICATION_TYPES.CONSENT_SIGNED:
        return {
          priority: NOTIFICATION_PRIORITIES.NORMAL,
          title: 'Consent signed',
          message: `${patientName} · ${text(payload, 'consentTitle', 'Consent document')}`,
          context: {
            target: NOTIFICATION_TARGETS.PATIENT_CONSENTS,
            consentId: event.aggregateId.toString(),
            patientId: optional(payload, 'patientId'),
          },
        };
      case NOTIFICATION_TYPES.GENERATED_DOCUMENT_READY:
        return {
          priority: NOTIFICATION_PRIORITIES.NORMAL,
          title: 'Generated document ready',
          message: `${text(payload, 'documentTitle', 'Document')} · ${patientName}`,
          context: {
            target: NOTIFICATION_TARGETS.PATIENT_DOCUMENTS,
            documentId: event.aggregateId.toString(),
            patientId: optional(payload, 'patientId'),
          },
        };
      case NOTIFICATION_TYPES.CARE_CONTINUITY_ATTENTION:
        return {
          priority: NOTIFICATION_PRIORITIES.IMPORTANT,
          title: 'Patient needs recontact',
          message: `${patientName} · Care continuity requires attention`,
          context: {
            target: NOTIFICATION_TARGETS.CARE_CONTINUITY,
            patientId: optional(payload, 'patientId'),
            treatmentId: optional(payload, 'treatmentId'),
            retentionPlanId: optional(payload, 'retentionPlanId'),
          },
        };
    }
  }
}

export const notificationDispatcher = new NotificationDispatcher();

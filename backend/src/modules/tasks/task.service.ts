import { BusinessRuleError, NotFoundError, ValidationError } from '../../common/errors/index.js';
import type { PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import {
  membershipRepository,
  type MembershipRepository,
} from '../memberships/membership.repository.js';
import { patientRepository, type PatientRepository } from '../patients/patient.repository.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import {
  communicationEventService,
  type CommunicationEventService,
} from '../notifications/notification.service.js';
import { NOTIFICATION_TYPES } from '../notifications/notification.types.js';
import { taskRepository, type TaskRepository } from './task.repository.js';
import {
  TASK_PRIORITIES,
  TASK_SCOPES,
  TASK_STATUSES,
  type CancelTaskInput,
  type CompleteTaskInput,
  type CreateTaskInput,
  type TaskActorSummary,
  type TaskContextDto,
  type TaskDto,
  type TaskListFilters,
  type TaskPatientSummary,
  type TaskRecord,
  type TaskSummaryDto,
  type UpdateTaskInput,
} from './task.types.js';

export class TaskService {
  constructor(
    private readonly tasks: TaskRepository = taskRepository,
    private readonly memberships: MembershipRepository = membershipRepository,
    private readonly users: UserRepository = userRepository,
    private readonly patients: PatientRepository = patientRepository,
    private readonly auditLogs: AuditLogService = auditLogService,
    private readonly communicationEvents: CommunicationEventService = communicationEventService,
  ) {}

  async create(clinicId: string, actorUserId: string, input: CreateTaskInput): Promise<TaskDto> {
    // 1. Validate Assignee membership in this clinic
    const assigneeMembership = await this.memberships.findByUserAndClinic(
      input.assignedToUserId,
      clinicId,
    );
    if (!assigneeMembership || assigneeMembership.status !== 'ACTIVE') {
      throw new ValidationError(
        'The assigned staff member does not have an active membership in this clinic',
      );
    }

    // 2. Validate Patient if present in context
    let patientObjId = null;
    let labelSnapshot = input.context?.labelSnapshot ?? null;

    if (input.context?.patientId) {
      const patient = await this.patients.findByIdInClinic(input.context.patientId, clinicId);
      if (!patient) {
        throw new NotFoundError('Referenced patient was not found');
      }
      patientObjId = toObjectId(input.context.patientId, 'patientId');
      if (!labelSnapshot) {
        labelSnapshot = `${patient.firstName} ${patient.lastName}`;
      }
    }

    const created = await withTransaction(async (session) => {
      const record = await this.tasks.create(
        {
          clinicId: toObjectId(clinicId, 'clinicId'),
          title: input.title.trim(),
          description: input.description?.trim() || null,
          priority: input.priority ?? TASK_PRIORITIES.NORMAL,
          status: TASK_STATUSES.TODO,
          assignedToUserId: toObjectId(input.assignedToUserId, 'assignedToUserId'),
          createdByUserId: toObjectId(actorUserId, 'createdByUserId'),
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          context: input.context
            ? {
                type: input.context.type,
                entityId: toObjectId(input.context.entityId, 'entityId'),
                patientId: patientObjId,
                labelSnapshot,
              }
            : null,
          attachments: input.attachments ?? [],
        },
        session,
      );
      const auditEvent = {
        clinicId,
        actorUserId,
        action: AUDIT_ACTIONS.TASK_CREATED,
        resourceType: AUDIT_RESOURCE_TYPES.TASK,
        resourceId: record._id.toString(),
        metadata: {
          title: record.title,
          priority: record.priority,
          assignedToUserId: input.assignedToUserId,
          contextType: input.context?.type ?? null,
        },
      } as const;
      if (session) await this.auditLogs.record(auditEvent, session);
      else await this.auditLogs.record(auditEvent);
      const communicationEvent = {
        clinicId,
        type: NOTIFICATION_TYPES.TASK_ASSIGNED,
        aggregateType: 'TASK',
        aggregateId: record._id.toString(),
        actorUserId,
        deduplicationKey: `TASK_ASSIGNED:${record._id.toString()}`,
        payload: {
          taskTitle: record.title,
          assignedToUserId: record.assignedToUserId.toString(),
          createdByUserId: record.createdByUserId.toString(),
          patientId: record.context?.patientId?.toString() ?? null,
        },
      } as const;
      if (session) await this.communicationEvents.enqueue(communicationEvent, session);
      else await this.communicationEvents.enqueue(communicationEvent);
      return record;
    });

    const [hydrated] = await this.hydrateTasks(clinicId, [created]);
    return hydrated!;
  }

  async getById(clinicId: string, taskId: string): Promise<TaskDto> {
    const record = await this.tasks.findById(clinicId, taskId);
    if (!record) {
      throw new NotFoundError('Task not found');
    }
    const [hydrated] = await this.hydrateTasks(clinicId, [record]);
    return hydrated!;
  }

  async list(
    clinicId: string,
    actorUserId: string,
    role: string | null,
    filters: TaskListFilters,
    pagination: PaginationParams,
    now: Date = new Date(),
  ): Promise<{
    result: { items: TaskDto[]; total: number };
    summary: TaskSummaryDto;
    pagination: PaginationParams;
  }> {
    // If Secretary / Assistant requests TEAM scope without manage-all permission, keep it to MINE
    const safeFilters = { ...filters };
    if (safeFilters.scope === TASK_SCOPES.TEAM && role === 'ASSISTANT') {
      safeFilters.scope = TASK_SCOPES.MINE;
    }

    const [paginated, summary] = await Promise.all([
      this.tasks.list(clinicId, actorUserId, safeFilters, pagination, now),
      this.tasks.getSummary(clinicId, actorUserId, now),
    ]);

    const hydrated = await this.hydrateTasks(clinicId, paginated.items, now);

    return {
      result: {
        items: hydrated,
        total: paginated.total,
      },
      summary,
      pagination,
    };
  }

  async update(
    clinicId: string,
    actorUserId: string,
    taskId: string,
    updates: UpdateTaskInput,
  ): Promise<TaskDto> {
    const existing = await this.tasks.findById(clinicId, taskId);
    if (!existing) {
      throw new NotFoundError('Task not found');
    }

    if (
      existing.status === TASK_STATUSES.COMPLETED ||
      existing.status === TASK_STATUSES.CANCELLED
    ) {
      throw new BusinessRuleError('Cannot modify a completed or cancelled task');
    }

    const patch: Partial<TaskRecord> = {};

    if (updates.title !== undefined) {
      patch.title = updates.title.trim();
    }
    if (updates.description !== undefined) {
      patch.description = updates.description?.trim() || null;
    }
    if (updates.priority !== undefined) {
      patch.priority = updates.priority;
    }
    if (updates.dueAt !== undefined) {
      patch.dueAt = updates.dueAt ? new Date(updates.dueAt) : null;
    }
    if (updates.attachments !== undefined) {
      patch.attachments = updates.attachments ?? [];
    }

    let reassigned = false;
    if (
      updates.assignedToUserId !== undefined &&
      updates.assignedToUserId !== existing.assignedToUserId.toString()
    ) {
      const membership = await this.memberships.findByUserAndClinic(
        updates.assignedToUserId,
        clinicId,
      );
      if (!membership || membership.status !== 'ACTIVE') {
        throw new ValidationError(
          'The assigned staff member does not have an active membership in this clinic',
        );
      }
      patch.assignedToUserId = toObjectId(updates.assignedToUserId, 'assignedToUserId');
      reassigned = true;
    }

    const updated = await withTransaction(async (session) => {
      const record = await this.tasks.update(clinicId, taskId, patch, session);
      if (!record) throw new NotFoundError('Task not found');
      const auditEvent = {
        clinicId,
        actorUserId,
        action: reassigned ? AUDIT_ACTIONS.TASK_REASSIGNED : AUDIT_ACTIONS.TASK_UPDATED,
        resourceType: AUDIT_RESOURCE_TYPES.TASK,
        resourceId: record._id.toString(),
        metadata: { reassigned, newAssignedToUserId: updates.assignedToUserId ?? null },
      } as const;
      if (session) await this.auditLogs.record(auditEvent, session);
      else await this.auditLogs.record(auditEvent);
      if (reassigned) {
        const communicationEvent = {
          clinicId,
          type: NOTIFICATION_TYPES.TASK_REASSIGNED,
          aggregateType: 'TASK',
          aggregateId: record._id.toString(),
          actorUserId,
          deduplicationKey: `TASK_REASSIGNED:${record._id.toString()}:${record.assignedToUserId.toString()}:${record.updatedAt.toISOString()}`,
          payload: {
            taskTitle: record.title,
            assignedToUserId: record.assignedToUserId.toString(),
            createdByUserId: record.createdByUserId.toString(),
            patientId: record.context?.patientId?.toString() ?? null,
          },
        } as const;
        if (session) await this.communicationEvents.enqueue(communicationEvent, session);
        else await this.communicationEvents.enqueue(communicationEvent);
      }
      return record;
    });

    const [hydrated] = await this.hydrateTasks(clinicId, [updated]);
    return hydrated!;
  }

  async start(clinicId: string, actorUserId: string, taskId: string): Promise<TaskDto> {
    const existing = await this.tasks.findById(clinicId, taskId);
    if (!existing) {
      throw new NotFoundError('Task not found');
    }

    if (existing.status !== TASK_STATUSES.TODO) {
      throw new BusinessRuleError(`Task cannot be started from status ${existing.status}`);
    }

    const updated = await this.tasks.update(clinicId, taskId, {
      status: TASK_STATUSES.IN_PROGRESS,
      startedAt: new Date(),
    });

    if (!updated) {
      throw new NotFoundError('Task not found');
    }

    await this.auditLogs.record({
      clinicId,
      actorUserId,
      action: AUDIT_ACTIONS.TASK_STARTED,
      resourceType: AUDIT_RESOURCE_TYPES.TASK,
      resourceId: updated._id.toString(),
    });

    const [hydrated] = await this.hydrateTasks(clinicId, [updated]);
    return hydrated!;
  }

  async complete(
    clinicId: string,
    actorUserId: string,
    taskId: string,
    input: CompleteTaskInput = {},
  ): Promise<TaskDto> {
    const existing = await this.tasks.findById(clinicId, taskId);
    if (!existing) {
      throw new NotFoundError('Task not found');
    }

    if (existing.status === TASK_STATUSES.COMPLETED) {
      throw new BusinessRuleError('Task is already completed');
    }
    if (existing.status === TASK_STATUSES.CANCELLED) {
      throw new BusinessRuleError('Cannot complete a cancelled task');
    }

    const patch: Partial<TaskRecord> = {
      status: TASK_STATUSES.COMPLETED,
      completedAt: new Date(),
      completedByUserId: toObjectId(actorUserId, 'completedByUserId'),
    };

    if (input.completionNote) {
      patch.description = existing.description
        ? `${existing.description}\n[Note]: ${input.completionNote.trim()}`
        : input.completionNote.trim();
    }

    const actor = await this.users.findById(actorUserId);
    const updated = await withTransaction(async (session) => {
      const record = await this.tasks.update(clinicId, taskId, patch, session);
      if (!record) throw new NotFoundError('Task not found');
      const auditEvent = {
        clinicId,
        actorUserId,
        action: AUDIT_ACTIONS.TASK_COMPLETED,
        resourceType: AUDIT_RESOURCE_TYPES.TASK,
        resourceId: record._id.toString(),
        metadata: { completionNote: input.completionNote ?? null },
      } as const;
      if (session) await this.auditLogs.record(auditEvent, session);
      else await this.auditLogs.record(auditEvent);
      const communicationEvent = {
        clinicId,
        type: NOTIFICATION_TYPES.TASK_COMPLETED,
        aggregateType: 'TASK',
        aggregateId: record._id.toString(),
        actorUserId,
        deduplicationKey: `TASK_COMPLETED:${record._id.toString()}`,
        payload: {
          taskTitle: record.title,
          createdByUserId: record.createdByUserId.toString(),
          completedByName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : 'A team member',
          patientId: record.context?.patientId?.toString() ?? null,
        },
      } as const;
      if (session) await this.communicationEvents.enqueue(communicationEvent, session);
      else await this.communicationEvents.enqueue(communicationEvent);
      return record;
    });

    const [hydrated] = await this.hydrateTasks(clinicId, [updated]);
    return hydrated!;
  }

  async cancel(
    clinicId: string,
    actorUserId: string,
    taskId: string,
    input: CancelTaskInput = {},
  ): Promise<TaskDto> {
    const existing = await this.tasks.findById(clinicId, taskId);
    if (!existing) {
      throw new NotFoundError('Task not found');
    }

    if (existing.status === TASK_STATUSES.COMPLETED) {
      throw new BusinessRuleError('Cannot cancel an already completed task');
    }
    if (existing.status === TASK_STATUSES.CANCELLED) {
      throw new BusinessRuleError('Task is already cancelled');
    }

    const updated = await this.tasks.update(clinicId, taskId, {
      status: TASK_STATUSES.CANCELLED,
      cancelledAt: new Date(),
      cancelledByUserId: toObjectId(actorUserId, 'cancelledByUserId'),
      cancellationReason: input.reason?.trim() || null,
    });

    if (!updated) {
      throw new NotFoundError('Task not found');
    }

    await this.auditLogs.record({
      clinicId,
      actorUserId,
      action: AUDIT_ACTIONS.TASK_CANCELLED,
      resourceType: AUDIT_RESOURCE_TYPES.TASK,
      resourceId: updated._id.toString(),
      metadata: {
        reason: input.reason ?? null,
      },
    });

    const [hydrated] = await this.hydrateTasks(clinicId, [updated]);
    return hydrated!;
  }

  async getSummary(
    clinicId: string,
    actorUserId: string,
    now: Date = new Date(),
  ): Promise<TaskSummaryDto> {
    return this.tasks.getSummary(clinicId, actorUserId, now);
  }

  private async hydrateTasks(
    clinicId: string,
    records: TaskRecord[],
    now: Date = new Date(),
  ): Promise<TaskDto[]> {
    if (records.length === 0) {
      return [];
    }

    // Collect IDs for batched queries
    const userIds = new Set<string>();
    const patientIds = new Set<string>();

    for (const record of records) {
      userIds.add(record.assignedToUserId.toString());
      userIds.add(record.createdByUserId.toString());
      if (record.completedByUserId) userIds.add(record.completedByUserId.toString());
      if (record.context?.patientId) patientIds.add(record.context.patientId.toString());
    }

    const [userDocs, memberships, patientDocs] = await Promise.all([
      this.users.findManyByIds(Array.from(userIds)),
      this.memberships.findManyByUsersInClinic(Array.from(userIds), clinicId),
      this.patients.findManyByIdsInClinic(Array.from(patientIds), clinicId),
    ]);

    const userMap = new Map(userDocs.map((user) => [user._id.toString(), user]));
    const membershipMap = new Map(memberships.map((m) => [m.userId.toString(), m]));
    const patientMap = new Map(patientDocs.map((patient) => [patient._id.toString(), patient]));

    const formatActor = (userIdStr: string): TaskActorSummary => {
      const u = userMap.get(userIdStr);
      const m = membershipMap.get(userIdStr);
      return {
        id: userIdStr,
        displayName: u ? `${u.firstName} ${u.lastName}`.trim() : 'Utilisateur',
        role: m?.role ?? null,
      };
    };

    return records.map((record): TaskDto => {
      const isOverdue =
        (record.status === TASK_STATUSES.TODO || record.status === TASK_STATUSES.IN_PROGRESS) &&
        record.dueAt !== null &&
        record.dueAt.getTime() < now.getTime();

      let patientSummary: TaskPatientSummary | null = null;
      if (record.context?.patientId) {
        const p = patientMap.get(record.context.patientId.toString());
        if (p) {
          patientSummary = {
            id: p._id.toString(),
            fullName: `${p.firstName} ${p.lastName}`.trim(),
            referenceNumber: p.referenceNumber ?? null,
          };
        }
      }

      let contextDto: TaskContextDto | null = null;
      if (record.context) {
        contextDto = {
          type: record.context.type,
          entityId: record.context.entityId.toString(),
          patientId: record.context.patientId?.toString() ?? null,
          label: record.context.labelSnapshot ?? null,
        };
      }

      return {
        id: record._id.toString(),
        clinicId: record.clinicId.toString(),
        title: record.title,
        description: record.description ?? null,
        status: record.status,
        priority: record.priority,
        isOverdue,
        assignedTo: formatActor(record.assignedToUserId.toString()),
        createdBy: formatActor(record.createdByUserId.toString()),
        completedBy: record.completedByUserId
          ? formatActor(record.completedByUserId.toString())
          : null,
        dueAt: record.dueAt ? record.dueAt.toISOString() : null,
        startedAt: record.startedAt ? record.startedAt.toISOString() : null,
        completedAt: record.completedAt ? record.completedAt.toISOString() : null,
        cancelledAt: record.cancelledAt ? record.cancelledAt.toISOString() : null,
        cancellationReason: record.cancellationReason ?? null,
        patient: patientSummary,
        context: contextDto,
        attachments: (record.attachments || []).map((att) => ({
          name: att.name,
          url: att.url,
          mimeType: att.mimeType ?? null,
          sizeBytes: att.sizeBytes ?? null,
        })),
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      };
    });
  }
}

export const taskService = new TaskService();

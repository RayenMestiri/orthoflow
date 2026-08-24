import type { ClientSession, QueryFilter } from 'mongoose';
import { toObjectId } from '../../common/utils/object-id.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { TaskModel } from './task.model.js';
import {
  TASK_PRIORITIES,
  TASK_SCOPES,
  TASK_STATUSES,
  type TaskAttributes,
  type TaskListFilters,
  type TaskRecord,
  type TaskSummaryDto,
} from './task.types.js';

export class TaskRepository {
  async create(
    data: Partial<TaskAttributes> & {
      clinicId: TaskAttributes['clinicId'];
      title: string;
      assignedToUserId: TaskAttributes['assignedToUserId'];
      createdByUserId: TaskAttributes['createdByUserId'];
    },
    session?: ClientSession,
  ): Promise<TaskRecord> {
    const [doc] = await TaskModel.create([data], { session });
    return doc!.toObject();
  }

  async findById(clinicId: string, taskId: string): Promise<TaskRecord | null> {
    return TaskModel.findOne({
      _id: toObjectId(taskId, 'taskId'),
      clinicId: toObjectId(clinicId, 'clinicId'),
    })
      .lean<TaskRecord | null>()
      .exec();
  }

  async list(
    clinicId: string,
    userId: string,
    filters: TaskListFilters,
    pagination: PaginationParams,
    now: Date = new Date(),
  ): Promise<PaginatedResult<TaskRecord>> {
    const clinicObjId = toObjectId(clinicId, 'clinicId');
    const userObjId = toObjectId(userId, 'userId');

    const query: QueryFilter<TaskAttributes> = { clinicId: clinicObjId };

    // 1. Apply Scope
    if (filters.scope === TASK_SCOPES.ASSIGNED_BY_ME) {
      query.createdByUserId = userObjId;
    } else if (filters.scope === TASK_SCOPES.TEAM) {
      // All tasks within clinic
    } else {
      // Default: MINE
      query.assignedToUserId = userObjId;
    }

    // 2. Specific Assignee override
    if (filters.assigneeId) {
      query.assignedToUserId = toObjectId(filters.assigneeId, 'assigneeId');
    }

    // 3. Patient filter
    if (filters.patientId) {
      query['context.patientId'] = toObjectId(filters.patientId, 'patientId');
    }

    // 4. Priority filter
    if (filters.priority) {
      query.priority = filters.priority;
    }

    // 5. Status / Overdue Filter
    if (filters.status === 'OVERDUE') {
      query.status = { $in: [TASK_STATUSES.TODO, TASK_STATUSES.IN_PROGRESS] };
      query.dueAt = { $lt: now, $ne: null };
    } else if (filters.status === 'ACTIVE') {
      query.status = { $in: [TASK_STATUSES.TODO, TASK_STATUSES.IN_PROGRESS] };
    } else if (filters.status && filters.status !== 'ALL') {
      query.status = filters.status;
    }

    // 6. Search
    if (filters.search?.trim()) {
      const searchRegex = new RegExp(
        filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { 'context.labelSnapshot': searchRegex },
      ];
    }

    const [items, total] = await Promise.all([
      TaskModel.find(query)
        .sort({
          // Deterministic sort: Overdue & Urgent first, then due date ASC, then createdAt DESC
          priority: -1,
          dueAt: 1,
          createdAt: -1,
        })
        .skip((pagination.page - 1) * pagination.limit)
        .limit(pagination.limit)
        .lean<TaskRecord[]>()
        .exec(),
      TaskModel.countDocuments(query).exec(),
    ]);

    return { items, total };
  }

  async getSummary(
    clinicId: string,
    userId: string,
    now: Date = new Date(),
  ): Promise<TaskSummaryDto> {
    const clinicObjId = toObjectId(clinicId, 'clinicId');
    const userObjId = toObjectId(userId, 'userId');

    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [summary] = await TaskModel.aggregate<{
      toDo: number;
      inProgress: number;
      overdue: number;
      urgent: number;
      completedToday: number;
    }>([
      {
        $match: {
          clinicId: clinicObjId,
          assignedToUserId: userObjId,
        },
      },
      {
        $group: {
          _id: null,
          toDo: {
            $sum: { $cond: [{ $eq: ['$status', TASK_STATUSES.TODO] }, 1, 0] },
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', TASK_STATUSES.IN_PROGRESS] }, 1, 0] },
          },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', [TASK_STATUSES.TODO, TASK_STATUSES.IN_PROGRESS]] },
                    { $ne: ['$dueAt', null] },
                    { $lt: ['$dueAt', now] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          urgent: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', [TASK_STATUSES.TODO, TASK_STATUSES.IN_PROGRESS]] },
                    { $eq: ['$priority', TASK_PRIORITIES.URGENT] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          completedToday: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', TASK_STATUSES.COMPLETED] },
                    { $gte: ['$completedAt', startOfToday] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).exec();

    return (
      summary ?? {
        toDo: 0,
        inProgress: 0,
        overdue: 0,
        urgent: 0,
        completedToday: 0,
      }
    );
  }

  async countOpenByPatient(clinicId: string, patientId: string): Promise<number> {
    return TaskModel.countDocuments({
      clinicId: toObjectId(clinicId, 'clinicId'),
      'context.patientId': toObjectId(patientId, 'patientId'),
      status: { $in: [TASK_STATUSES.TODO, TASK_STATUSES.IN_PROGRESS] },
    }).exec();
  }

  async update(
    clinicId: string,
    taskId: string,
    updates: Partial<TaskAttributes>,
    session?: ClientSession,
  ): Promise<TaskRecord | null> {
    return TaskModel.findOneAndUpdate(
      {
        _id: toObjectId(taskId, 'taskId'),
        clinicId: toObjectId(clinicId, 'clinicId'),
      },
      { $set: updates },
      { new: true, session },
    )
      .lean<TaskRecord | null>()
      .exec();
  }
}

export const taskRepository = new TaskRepository();

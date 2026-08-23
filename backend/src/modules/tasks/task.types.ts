import type { Types } from 'mongoose';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';

export type { PaginationParams };

export const TASK_STATUSES = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type TaskStatus = (typeof TASK_STATUSES)[keyof typeof TASK_STATUSES];
export const TASK_STATUS_VALUES = Object.values(TASK_STATUSES) as [TaskStatus, ...TaskStatus[]];

export const TASK_PRIORITIES = {
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[keyof typeof TASK_PRIORITIES];
export const TASK_PRIORITY_VALUES = Object.values(TASK_PRIORITIES) as [TaskPriority, ...TaskPriority[]];

export const TASK_CONTEXT_TYPES = {
  PATIENT: 'PATIENT',
  APPOINTMENT: 'APPOINTMENT',
  TREATMENT: 'TREATMENT',
  CASH_RECORD: 'CASH_RECORD',
  DOCUMENT: 'DOCUMENT',
  FOLLOW_UP: 'FOLLOW_UP',
  RETENTION: 'RETENTION',
} as const;

export type TaskContextType = (typeof TASK_CONTEXT_TYPES)[keyof typeof TASK_CONTEXT_TYPES];
export const TASK_CONTEXT_TYPE_VALUES = Object.values(TASK_CONTEXT_TYPES) as [
  TaskContextType,
  ...TaskContextType[],
];

export const TASK_SCOPES = {
  MINE: 'MINE',
  ASSIGNED_BY_ME: 'ASSIGNED_BY_ME',
  TEAM: 'TEAM',
} as const;

export type TaskScope = (typeof TASK_SCOPES)[keyof typeof TASK_SCOPES];
export const TASK_SCOPE_VALUES = Object.values(TASK_SCOPES) as [TaskScope, ...TaskScope[]];

export interface TaskContextSnapshot {
  type: TaskContextType;
  entityId: string;
  patientId?: string | null;
  labelSnapshot?: string | null;
}

export interface TaskAttachment {
  name: string;
  url: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

export interface TaskAttributes {
  clinicId: Types.ObjectId;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedToUserId: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  dueAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  completedByUserId: Types.ObjectId | null;
  cancelledAt: Date | null;
  cancelledByUserId: Types.ObjectId | null;
  cancellationReason: string | null;
  context: {
    type: TaskContextType;
    entityId: Types.ObjectId;
    patientId: Types.ObjectId | null;
    labelSnapshot: string | null;
  } | null;
  attachments?: TaskAttachment[] | null;
}

export type TaskRecord = TaskAttributes & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export interface TaskActorSummary {
  id: string;
  displayName: string;
  role: string | null;
}

export interface TaskPatientSummary {
  id: string;
  fullName: string;
  referenceNumber: string | null;
}

export interface TaskContextDto {
  type: TaskContextType;
  entityId: string;
  patientId: string | null;
  label: string | null;
}

export interface TaskDto {
  id: string;
  clinicId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  isOverdue: boolean;
  assignedTo: TaskActorSummary;
  createdBy: TaskActorSummary;
  completedBy: TaskActorSummary | null;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  patient: TaskPatientSummary | null;
  context: TaskContextDto | null;
  attachments: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskSummaryDto {
  toDo: number;
  inProgress: number;
  overdue: number;
  urgent: number;
  completedToday: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  assignedToUserId: string;
  dueAt?: Date | null;
  context?: {
    type: TaskContextType;
    entityId: string;
    patientId?: string | null;
    labelSnapshot?: string | null;
  } | null;
  attachments?: TaskAttachment[] | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  assignedToUserId?: string;
  dueAt?: Date | null;
  attachments?: TaskAttachment[] | null;
}

export interface CompleteTaskInput {
  completionNote?: string | null;
}

export interface CancelTaskInput {
  reason?: string | null;
}

export interface TaskListFilters {
  scope?: TaskScope;
  status?: TaskStatus | 'ALL' | 'ACTIVE' | 'OVERDUE';
  priority?: TaskPriority;
  assigneeId?: string;
  patientId?: string;
  search?: string;
}

export type PaginatedTasks = PaginatedResult<TaskDto>;

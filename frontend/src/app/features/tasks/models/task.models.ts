export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TaskPriority = 'NORMAL' | 'HIGH' | 'URGENT';
export type TaskContextType =
  | 'PATIENT'
  | 'APPOINTMENT'
  | 'TREATMENT'
  | 'CASH_RECORD'
  | 'DOCUMENT'
  | 'FOLLOW_UP'
  | 'RETENTION';
export type TaskScope = 'MINE' | 'ASSIGNED_BY_ME' | 'TEAM';

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

export interface TaskAttachment {
  name: string;
  url: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
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
  dueAt?: string | null;
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
  dueAt?: string | null;
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
  page?: number;
  limit?: number;
}

export interface TaskPaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

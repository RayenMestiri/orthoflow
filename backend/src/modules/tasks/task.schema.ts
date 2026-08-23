import { z } from 'zod';
import {
  TASK_CONTEXT_TYPE_VALUES,
  TASK_PRIORITIES,
  TASK_PRIORITY_VALUES,
  TASK_SCOPES,
  TASK_SCOPE_VALUES,
  TASK_STATUS_VALUES,
} from './task.types.js';

export const taskActorSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  role: z.string().nullable(),
});

export const taskPatientSummarySchema = z.object({
  id: z.string(),
  fullName: z.string(),
  referenceNumber: z.string().nullable(),
});

export const taskContextDtoSchema = z.object({
  type: z.enum(TASK_CONTEXT_TYPE_VALUES),
  entityId: z.string(),
  patientId: z.string().nullable(),
  label: z.string().nullable(),
});

export const taskAttachmentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().min(1),
  mimeType: z.string().nullish(),
  sizeBytes: z.number().nullish(),
});

export const taskDtoSchema = z.object({
  id: z.string(),
  clinicId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(TASK_STATUS_VALUES),
  priority: z.enum(TASK_PRIORITY_VALUES),
  isOverdue: z.boolean(),
  assignedTo: taskActorSummarySchema,
  createdBy: taskActorSummarySchema,
  completedBy: taskActorSummarySchema.nullable(),
  dueAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  patient: taskPatientSummarySchema.nullable(),
  context: taskContextDtoSchema.nullable(),
  attachments: z.array(taskAttachmentSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const taskSummaryDtoSchema = z.object({
  toDo: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  urgent: z.number().int().nonnegative(),
  completedToday: z.number().int().nonnegative(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(140, 'Title is too long'),
  description: z.string().trim().max(1000, 'Description is too long').nullish(),
  priority: z.enum(TASK_PRIORITY_VALUES).default(TASK_PRIORITIES.NORMAL),
  assignedToUserId: z.string().min(1, 'Assignee is required'),
  dueAt: z.string().nullish(),
  context: z
    .object({
      type: z.enum(TASK_CONTEXT_TYPE_VALUES),
      entityId: z.string().min(1),
      patientId: z.string().nullish(),
      labelSnapshot: z.string().trim().max(200).nullish(),
    })
    .nullish(),
  attachments: z.array(taskAttachmentSchema).nullish(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().max(1000).nullish(),
  priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  assignedToUserId: z.string().min(1).optional(),
  dueAt: z.string().nullish(),
  attachments: z.array(taskAttachmentSchema).nullish(),
});

export const completeTaskSchema = z.object({
  completionNote: z.string().trim().max(500).nullish(),
});

export const cancelTaskSchema = z.object({
  reason: z.string().trim().max(500).nullish(),
});

export const taskListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  scope: z.enum(TASK_SCOPE_VALUES).default(TASK_SCOPES.MINE),
  status: z.enum([...TASK_STATUS_VALUES, 'ALL', 'ACTIVE', 'OVERDUE']).default('ACTIVE'),
  priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  assigneeId: z.string().optional(),
  patientId: z.string().optional(),
  search: z.string().trim().optional(),
});

import { Schema, model } from 'mongoose';
import {
  TASK_CONTEXT_TYPE_VALUES,
  TASK_PRIORITIES,
  TASK_PRIORITY_VALUES,
  TASK_STATUSES,
  TASK_STATUS_VALUES,
  type TaskRecord,
} from './task.types.js';

const taskContextSchema = new Schema(
  {
    type: {
      type: String,
      enum: TASK_CONTEXT_TYPE_VALUES,
      required: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    labelSnapshot: {
      type: String,
      default: null,
      maxlength: 200,
    },
  },
  { _id: false },
);

const taskAttachmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    url: { type: String, required: true, trim: true },
    mimeType: { type: String, default: null },
    sizeBytes: { type: Number, default: null },
  },
  { _id: false },
);

const taskSchema = new Schema<TaskRecord>(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    description: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: TASK_STATUS_VALUES,
      default: TASK_STATUSES.TODO,
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: TASK_PRIORITY_VALUES,
      default: TASK_PRIORITIES.NORMAL,
      required: true,
      index: true,
    },
    assignedToUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    dueAt: {
      type: Date,
      default: null,
      index: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    completedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancellationReason: {
      type: String,
      default: null,
      maxlength: 500,
    },
    context: {
      type: taskContextSchema,
      default: null,
    },
    attachments: {
      type: [taskAttachmentSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for bounded fast querying
taskSchema.index({ clinicId: 1, assignedToUserId: 1, status: 1, dueAt: 1 });
taskSchema.index({ clinicId: 1, createdByUserId: 1, status: 1, dueAt: 1 });
taskSchema.index({ clinicId: 1, 'context.patientId': 1, status: 1 });
taskSchema.index({ clinicId: 1, 'context.type': 1, 'context.entityId': 1 });

export const TaskModel = model<TaskRecord>('Task', taskSchema);

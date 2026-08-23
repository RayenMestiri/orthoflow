import type { Types } from 'mongoose';

export const RETENTION_STATUSES = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type RetentionStatus = (typeof RETENTION_STATUSES)[keyof typeof RETENTION_STATUSES];
export const RETENTION_STATUS_VALUES = Object.values(RETENTION_STATUSES) as [
  RetentionStatus,
  ...RetentionStatus[],
];

export const RETAINER_TYPES = {
  FIXED_WIRE: 'FIXED_WIRE',
  CLEAR_RETAINER: 'CLEAR_RETAINER',
  HAWLEY: 'HAWLEY',
  OTHER: 'OTHER',
} as const;
export type RetainerType = (typeof RETAINER_TYPES)[keyof typeof RETAINER_TYPES];
export const RETAINER_TYPE_VALUES = Object.values(RETAINER_TYPES) as [RetainerType, ...RetainerType[]];

export const RETAINER_ARCHES = { UPPER: 'UPPER', LOWER: 'LOWER', BOTH: 'BOTH' } as const;
export type RetainerArch = (typeof RETAINER_ARCHES)[keyof typeof RETAINER_ARCHES];
export const RETAINER_ARCH_VALUES = Object.values(RETAINER_ARCHES) as [RetainerArch, ...RetainerArch[]];

export const RETAINER_STATUSES = {
  ACTIVE: 'ACTIVE',
  REPLACED: 'REPLACED',
  LOST: 'LOST',
  DISCONTINUED: 'DISCONTINUED',
} as const;
export type RetainerStatus = (typeof RETAINER_STATUSES)[keyof typeof RETAINER_STATUSES];
export const RETAINER_STATUS_VALUES = Object.values(RETAINER_STATUSES) as [
  RetainerStatus,
  ...RetainerStatus[],
];

export interface RetentionPlanAttributes {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  treatmentId: Types.ObjectId;
  status: RetentionStatus;
  initialControlRecommendedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  completionReason: string | null;
  notes: string | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}
export type RetentionPlanRecord = RetentionPlanAttributes & { _id: Types.ObjectId };

export interface RetainerDeviceAttributes {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  treatmentId: Types.ObjectId;
  retentionPlanId: Types.ObjectId;
  type: RetainerType;
  customTypeLabel: string | null;
  arch: RetainerArch;
  status: RetainerStatus;
  deliveredAt: Date;
  endedAt: Date | null;
  replacesRetainerId: Types.ObjectId | null;
  notes: string | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}
export type RetainerDeviceRecord = RetainerDeviceAttributes & { _id: Types.ObjectId };

export interface RetainerDeviceInput {
  type: RetainerType;
  customTypeLabel?: string | null;
  arch: RetainerArch;
  deliveredAt?: Date;
  notes?: string | null;
}

export interface RetainerDeviceDto {
  id: string;
  retentionPlanId: string;
  type: RetainerType;
  customTypeLabel: string | null;
  arch: RetainerArch;
  status: RetainerStatus;
  deliveredAt: string;
  endedAt: string | null;
  replacesRetainerId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RetentionPlanDto {
  id: string;
  clinicId: string;
  patientId: string;
  treatmentId: string;
  status: RetentionStatus;
  initialControlRecommendedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  completionReason: string | null;
  notes: string | null;
  retainers: RetainerDeviceDto[];
  createdAt: string;
  updatedAt: string;
}

import type { Types } from 'mongoose';

export const TREATMENT_TYPES = {
  METAL_BRACES: 'METAL_BRACES',
  CERAMIC_BRACES: 'CERAMIC_BRACES',
  CLEAR_ALIGNERS: 'CLEAR_ALIGNERS',
  RETAINER: 'RETAINER',
  FUNCTIONAL_APPLIANCE: 'FUNCTIONAL_APPLIANCE',
  EXPANDER: 'EXPANDER',
  OTHER: 'OTHER',
} as const;

export type TreatmentType = (typeof TREATMENT_TYPES)[keyof typeof TREATMENT_TYPES];
export const TREATMENT_TYPE_VALUES = Object.values(TREATMENT_TYPES) as [
  TreatmentType,
  ...TreatmentType[],
];

export const TREATMENT_STATUSES = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type TreatmentStatus = (typeof TREATMENT_STATUSES)[keyof typeof TREATMENT_STATUSES];
export const TREATMENT_STATUS_VALUES = Object.values(TREATMENT_STATUSES) as [
  TreatmentStatus,
  ...TreatmentStatus[],
];

export const TREATMENT_STATUS_TRANSITIONS: Readonly<
  Record<TreatmentStatus, readonly TreatmentStatus[]>
> = {
  PLANNED: [TREATMENT_STATUSES.ACTIVE, TREATMENT_STATUSES.CANCELLED],
  ACTIVE: [TREATMENT_STATUSES.PAUSED, TREATMENT_STATUSES.COMPLETED, TREATMENT_STATUSES.CANCELLED],
  PAUSED: [TREATMENT_STATUSES.ACTIVE, TREATMENT_STATUSES.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

export const CLOSED_TREATMENT_STATUSES: readonly TreatmentStatus[] = [
  TREATMENT_STATUSES.COMPLETED,
  TREATMENT_STATUSES.CANCELLED,
];

export function isClosedTreatmentStatus(status: TreatmentStatus): boolean {
  return CLOSED_TREATMENT_STATUSES.includes(status);
}

export function canTransitionTreatment(from: TreatmentStatus, to: TreatmentStatus): boolean {
  return TREATMENT_STATUS_TRANSITIONS[from].includes(to);
}

export const TREATMENT_MILESTONE_TYPES = {
  CONSULTATION: 'CONSULTATION',
  TREATMENT_PLAN_CREATED: 'TREATMENT_PLAN_CREATED',
  APPLIANCE_FITTED: 'APPLIANCE_FITTED',
  WIRE_ADJUSTMENT: 'WIRE_ADJUSTMENT',
  BRACKET_REPAIR: 'BRACKET_REPAIR',
  IMPRESSION: 'IMPRESSION',
  SCAN: 'SCAN',
  CONTROL: 'CONTROL',
  APPLIANCE_REMOVAL: 'APPLIANCE_REMOVAL',
  RETAINER_DELIVERED: 'RETAINER_DELIVERED',
  TREATMENT_PAUSED: 'TREATMENT_PAUSED',
  TREATMENT_RESUMED: 'TREATMENT_RESUMED',
  TREATMENT_COMPLETED: 'TREATMENT_COMPLETED',
  CUSTOM: 'CUSTOM',
} as const;

export type TreatmentMilestoneType =
  (typeof TREATMENT_MILESTONE_TYPES)[keyof typeof TREATMENT_MILESTONE_TYPES];
export const TREATMENT_MILESTONE_TYPE_VALUES = Object.values(TREATMENT_MILESTONE_TYPES) as [
  TreatmentMilestoneType,
  ...TreatmentMilestoneType[],
];

export const MANUAL_TREATMENT_MILESTONE_TYPES: readonly TreatmentMilestoneType[] = [
  TREATMENT_MILESTONE_TYPES.CONSULTATION,
  TREATMENT_MILESTONE_TYPES.APPLIANCE_FITTED,
  TREATMENT_MILESTONE_TYPES.WIRE_ADJUSTMENT,
  TREATMENT_MILESTONE_TYPES.BRACKET_REPAIR,
  TREATMENT_MILESTONE_TYPES.IMPRESSION,
  TREATMENT_MILESTONE_TYPES.SCAN,
  TREATMENT_MILESTONE_TYPES.CONTROL,
  TREATMENT_MILESTONE_TYPES.APPLIANCE_REMOVAL,
  TREATMENT_MILESTONE_TYPES.RETAINER_DELIVERED,
  TREATMENT_MILESTONE_TYPES.CUSTOM,
];

export interface TreatmentAttributes {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  type: TreatmentType;
  customTypeLabel: string | null;
  status: TreatmentStatus;
  startDate: Date | null;
  expectedEndDate: Date | null;
  completedAt: Date | null;
  agreedPrice: number | null;
  notes: string | null;
  cancellationReason: string | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TreatmentRecord = TreatmentAttributes & { _id: Types.ObjectId };

export interface TreatmentMilestoneAttributes {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  treatmentId: Types.ObjectId;
  type: TreatmentMilestoneType;
  title: string;
  description: string | null;
  occurredAt: Date;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TreatmentMilestoneRecord = TreatmentMilestoneAttributes & { _id: Types.ObjectId };

export interface CreateTreatmentInput {
  clinicId: string;
  patientId: string;
  doctorId: string;
  type: TreatmentType;
  customTypeLabel?: string | null;
  status?: TreatmentStatus;
  startDate?: Date | null;
  expectedEndDate?: Date | null;
  agreedPrice?: number | null;
  notes?: string | null;
  createdBy: string;
}

export interface UpdateTreatmentFields {
  type?: TreatmentType;
  customTypeLabel?: string | null;
  expectedEndDate?: Date | null;
  agreedPrice?: number | null;
  notes?: string | null;
  updatedBy: string;
}

export interface TreatmentStatusChangeFields {
  status: TreatmentStatus;
  startDate?: Date;
  completedAt?: Date;
  cancellationReason?: string | null;
  updatedBy: string;
}

export interface CreateTreatmentMilestoneInput {
  clinicId: string;
  patientId: string;
  treatmentId: string;
  type: TreatmentMilestoneType;
  title: string;
  description?: string | null;
  occurredAt: Date;
  createdBy: string;
}

export interface UpdateTreatmentMilestoneFields {
  title?: string;
  description?: string | null;
  occurredAt?: Date;
  updatedBy: string;
}

export interface TreatmentMilestoneDto {
  id: string;
  treatmentId: string;
  patientId: string;
  type: TreatmentMilestoneType;
  title: string;
  description: string | null;
  occurredAt: string;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentDto {
  id: string;
  clinicId: string;
  patientId: string;
  doctorId: string;
  type: TreatmentType;
  customTypeLabel: string | null;
  status: TreatmentStatus;
  startDate: string | null;
  expectedEndDate: string | null;
  completedAt: string | null;
  agreedPrice: number | null;
  notes: string | null;
  cancellationReason: string | null;
  durationDays: number | null;
  isCurrent: boolean;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentWithMilestonesDto extends TreatmentDto {
  milestones: TreatmentMilestoneDto[];
}

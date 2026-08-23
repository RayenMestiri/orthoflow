export type RetentionStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type RetainerType = 'FIXED_WIRE' | 'CLEAR_RETAINER' | 'HAWLEY' | 'OTHER';
export type RetainerArch = 'UPPER' | 'LOWER' | 'BOTH';
export type RetainerStatus = 'ACTIVE' | 'REPLACED' | 'LOST' | 'DISCONTINUED';

export interface RetainerDevice {
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

export interface RetentionPlan {
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
  retainers: RetainerDevice[];
  createdAt: string;
  updatedAt: string;
}

export interface RetainerInput {
  type: RetainerType;
  customTypeLabel?: string | null;
  arch: RetainerArch;
  deliveredAt?: string;
  notes?: string | null;
}

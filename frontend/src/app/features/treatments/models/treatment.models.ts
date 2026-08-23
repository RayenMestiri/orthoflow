export type TreatmentStatus = 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export type TreatmentType =
  | 'METAL_BRACES'
  | 'CERAMIC_BRACES'
  | 'CLEAR_ALIGNERS'
  | 'RETAINER'
  | 'FUNCTIONAL_APPLIANCE'
  | 'EXPANDER'
  | 'OTHER';

export type TreatmentMilestoneType =
  | 'CONSULTATION'
  | 'TREATMENT_PLAN_CREATED'
  | 'APPLIANCE_FITTED'
  | 'WIRE_ADJUSTMENT'
  | 'BRACKET_REPAIR'
  | 'IMPRESSION'
  | 'SCAN'
  | 'CONTROL'
  | 'APPLIANCE_REMOVAL'
  | 'RETAINER_DELIVERED'
  | 'TREATMENT_PAUSED'
  | 'TREATMENT_RESUMED'
  | 'TREATMENT_COMPLETED'
  | 'CUSTOM';

export const TREATMENT_TYPES: readonly TreatmentType[] = [
  'METAL_BRACES',
  'CERAMIC_BRACES',
  'CLEAR_ALIGNERS',
  'RETAINER',
  'FUNCTIONAL_APPLIANCE',
  'EXPANDER',
  'OTHER',
];

export const MANUAL_MILESTONE_TYPES: readonly TreatmentMilestoneType[] = [
  'CONSULTATION',
  'APPLIANCE_FITTED',
  'WIRE_ADJUSTMENT',
  'BRACKET_REPAIR',
  'IMPRESSION',
  'SCAN',
  'CONTROL',
  'APPLIANCE_REMOVAL',
  'RETAINER_DELIVERED',
  'CUSTOM',
];

export interface TreatmentMilestone {
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

export interface Treatment {
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
  completionDate?: string | null;
  debondPerformed?: boolean;
  debondDate?: string | null;
  retentionRequired?: boolean;
  finalMediaIds?: string[];
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

export interface TreatmentWithMilestones extends Treatment {
  milestones: TreatmentMilestone[];
}

export interface CreateTreatmentInput {
  type: TreatmentType;
  customTypeLabel?: string | null;
  status?: 'PLANNED' | 'ACTIVE';
  startDate?: string | null;
  expectedEndDate?: string | null;
  agreedPrice?: number | null;
  notes?: string | null;
}

export interface UpdateTreatmentInput {
  type?: TreatmentType;
  customTypeLabel?: string | null;
  expectedEndDate?: string | null;
  agreedPrice?: number | null;
  notes?: string | null;
}

export interface CompleteTreatmentInput {
  completionDate: string;
  debondPerformed: boolean;
  debondDate: string | null;
  retentionRequired: boolean;
  finalMediaIds: string[];
}

export interface CreateMilestoneInput {
  type: TreatmentMilestoneType;
  title: string;
  description?: string | null;
  occurredAt?: string;
}

export interface UpdateMilestoneInput {
  title?: string;
  description?: string | null;
  occurredAt?: string;
}

const STATUS_LABELS: Record<TreatmentStatus, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const TYPE_LABELS: Record<TreatmentType, string> = {
  METAL_BRACES: 'Metal braces',
  CERAMIC_BRACES: 'Ceramic braces',
  CLEAR_ALIGNERS: 'Clear aligners',
  RETAINER: 'Retainer',
  FUNCTIONAL_APPLIANCE: 'Functional appliance',
  EXPANDER: 'Expander',
  OTHER: 'Other',
};

const MILESTONE_LABELS: Record<TreatmentMilestoneType, string> = {
  CONSULTATION: 'Consultation',
  TREATMENT_PLAN_CREATED: 'Treatment plan created',
  APPLIANCE_FITTED: 'Appliance fitted',
  WIRE_ADJUSTMENT: 'Wire adjustment',
  BRACKET_REPAIR: 'Bracket repair',
  IMPRESSION: 'Impression',
  SCAN: 'Scan',
  CONTROL: 'Control',
  APPLIANCE_REMOVAL: 'Appliance removal',
  RETAINER_DELIVERED: 'Retainer delivered',
  TREATMENT_PAUSED: 'Treatment paused',
  TREATMENT_RESUMED: 'Treatment resumed',
  TREATMENT_COMPLETED: 'Treatment completed',
  CUSTOM: 'Custom milestone',
};

export function treatmentStatusLabel(status: TreatmentStatus): string {
  return STATUS_LABELS[status];
}

export function treatmentTypeLabel(type: TreatmentType, customTypeLabel?: string | null): string {
  return type === 'OTHER' && customTypeLabel ? customTypeLabel : TYPE_LABELS[type];
}

export function milestoneTypeLabel(type: TreatmentMilestoneType): string {
  return MILESTONE_LABELS[type];
}

export function milestoneIcon(type: TreatmentMilestoneType): string {
  if (type === 'TREATMENT_COMPLETED') return 'task_alt';
  if (type === 'TREATMENT_PAUSED') return 'pause_circle';
  if (type === 'TREATMENT_RESUMED') return 'play_circle';
  if (type === 'SCAN' || type === 'IMPRESSION') return 'document_scanner';
  if (type === 'APPLIANCE_FITTED' || type === 'RETAINER_DELIVERED') return 'medical_services';
  if (type === 'WIRE_ADJUSTMENT' || type === 'BRACKET_REPAIR') return 'build';
  return 'radio_button_checked';
}

export function formatTreatmentDuration(days: number | null): string {
  if (days === null) return 'Not started';
  if (days < 31) return days === 1 ? '1 day' : `${days} days`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return months === 1 ? '1 month' : `${months} months`;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const yearsLabel = years === 1 ? '1 year' : `${years} years`;
  return remainder ? `${yearsLabel} ${remainder}m` : yearsLabel;
}

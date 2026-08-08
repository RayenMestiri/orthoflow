export type TreatmentStatus = 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export type TreatmentEventType =
  | 'STARTED'
  | 'CHECKPOINT'
  | 'ADJUSTMENT'
  | 'NOTE'
  | 'PAUSED'
  | 'RESUMED'
  | 'COMPLETED'
  | 'CANCELLED';

/** Event kinds a clinician may record by hand; the rest are written by the server. */
export const MANUAL_EVENT_TYPES: readonly TreatmentEventType[] = ['CHECKPOINT', 'ADJUSTMENT', 'NOTE'];

/** Offered in the type picker. Free text on the server, so a clinic may type its own. */
export const TREATMENT_TYPE_SUGGESTIONS: readonly string[] = [
  'Fixed braces',
  'Clear aligners',
  'Retainer',
  'Functional appliance',
  'Expansion treatment',
  'Mixed orthodontic treatment',
  'Other',
];

export interface TreatmentProgressEntry {
  id: string;
  treatmentId: string;
  patientId: string;
  occurredAt: string;
  type: TreatmentEventType;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Treatment {
  id: string;
  clinicId: string;
  patientId: string;
  doctorId: string;

  treatmentType: string;
  status: TreatmentStatus;

  startDate: string | null;
  expectedEndDate: string | null;
  actualEndDate: string | null;

  notes: string | null;
  totalPlannedCost: number | null;
  cancellationReason: string | null;

  durationDays: number | null;
  /** True while this course occupies the patient's single care slot. */
  isCurrent: boolean;

  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the patient profile renders: the plan plus its timeline. */
export interface TreatmentWithProgress extends Treatment {
  progress: TreatmentProgressEntry[];
}

export interface CreateTreatmentInput {
  treatmentType: string;
  status?: 'PLANNED' | 'ACTIVE';
  startDate?: string | null;
  expectedEndDate?: string | null;
  notes?: string | null;
  totalPlannedCost?: number | null;
}

export interface UpdateTreatmentInput {
  treatmentType?: string;
  startDate?: string | null;
  expectedEndDate?: string | null;
  notes?: string | null;
  totalPlannedCost?: number | null;
}

export interface CreateProgressInput {
  type: TreatmentEventType;
  occurredAt?: string;
  note?: string | null;
}

const STATUS_LABELS: Record<TreatmentStatus, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'In progress',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function treatmentStatusLabel(status: TreatmentStatus): string {
  return STATUS_LABELS[status];
}

const EVENT_LABELS: Record<TreatmentEventType, string> = {
  STARTED: 'Treatment started',
  CHECKPOINT: 'Checkpoint',
  ADJUSTMENT: 'Adjustment',
  NOTE: 'Note',
  PAUSED: 'Treatment paused',
  RESUMED: 'Treatment resumed',
  COMPLETED: 'Treatment completed',
  CANCELLED: 'Treatment cancelled',
};

export function treatmentEventLabel(type: TreatmentEventType): string {
  return EVENT_LABELS[type];
}

const EVENT_ICONS: Record<TreatmentEventType, string> = {
  STARTED: 'play_circle',
  CHECKPOINT: 'flag',
  ADJUSTMENT: 'build',
  NOTE: 'sticky_note_2',
  PAUSED: 'pause_circle',
  RESUMED: 'play_circle',
  COMPLETED: 'task_alt',
  CANCELLED: 'cancel',
};

export function treatmentEventIcon(type: TreatmentEventType): string {
  return EVENT_ICONS[type];
}

/**
 * How long a course has run, phrased the way a clinician says it out loud:
 * days for the first month, then months, then years and months.
 */
export function formatTreatmentDuration(days: number | null): string {
  if (days === null) {
    return 'Not started';
  }
  if (days < 31) {
    return days === 1 ? '1 day' : `${days} days`;
  }

  const months = Math.floor(days / 30.44);
  if (months < 12) {
    return months === 1 ? '1 month' : `${months} months`;
  }

  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const yearPart = years === 1 ? '1 year' : `${years} years`;
  return remainder === 0 ? yearPart : `${yearPart} ${remainder}m`;
}

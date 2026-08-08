import type { Types } from 'mongoose';

/**
 * The life of a course of orthodontic care.
 *
 * Unlike an appointment — which is one afternoon — a treatment runs for months
 * or years, so the states describe a long-running plan rather than a visit.
 */
export const TREATMENT_STATUSES = {
  /** Agreed but not begun. No appliance fitted yet. */
  PLANNED: 'PLANNED',
  /** Under way. At most one per patient. */
  ACTIVE: 'ACTIVE',
  /** Temporarily halted — patient travelling, finances, medical reason. */
  PAUSED: 'PAUSED',
  /** Finished. Terminal, and the anchor for retention follow-up. */
  COMPLETED: 'COMPLETED',
  /** Abandoned before completion. Terminal, never deleted. */
  CANCELLED: 'CANCELLED',
} as const;

export type TreatmentStatus = (typeof TREATMENT_STATUSES)[keyof typeof TREATMENT_STATUSES];

export const TREATMENT_STATUS_VALUES = Object.values(TREATMENT_STATUSES) as [
  TreatmentStatus,
  ...TreatmentStatus[],
];

/**
 * Allowed status moves.
 *
 * A plan may be cancelled before it ever starts; an active course may pause and
 * resume any number of times. What is not allowed is reviving a terminal state —
 * a completed course of treatment is history, and a new plan is a new record.
 */
export const TREATMENT_STATUS_TRANSITIONS: Readonly<
  Record<TreatmentStatus, readonly TreatmentStatus[]>
> = {
  [TREATMENT_STATUSES.PLANNED]: [TREATMENT_STATUSES.ACTIVE, TREATMENT_STATUSES.CANCELLED],
  [TREATMENT_STATUSES.ACTIVE]: [
    TREATMENT_STATUSES.PAUSED,
    TREATMENT_STATUSES.COMPLETED,
    TREATMENT_STATUSES.CANCELLED,
  ],
  [TREATMENT_STATUSES.PAUSED]: [
    TREATMENT_STATUSES.ACTIVE,
    TREATMENT_STATUSES.COMPLETED,
    TREATMENT_STATUSES.CANCELLED,
  ],
  [TREATMENT_STATUSES.COMPLETED]: [],
  [TREATMENT_STATUSES.CANCELLED]: [],
};

/** Terminal states. The course is over; its plan may no longer be edited. */
export const CLOSED_TREATMENT_STATUSES: readonly TreatmentStatus[] = [
  TREATMENT_STATUSES.COMPLETED,
  TREATMENT_STATUSES.CANCELLED,
];

/**
 * States that occupy the patient's single "current care" slot.
 *
 * PAUSED counts: the patient is still mid-treatment with an appliance fitted,
 * so a second course must not be opened alongside it.
 */
export const OCCUPYING_TREATMENT_STATUSES: readonly TreatmentStatus[] = [
  TREATMENT_STATUSES.ACTIVE,
  TREATMENT_STATUSES.PAUSED,
];

export function isClosedTreatmentStatus(status: TreatmentStatus): boolean {
  return CLOSED_TREATMENT_STATUSES.includes(status);
}

export function canTransitionTreatment(from: TreatmentStatus, to: TreatmentStatus): boolean {
  return TREATMENT_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Kinds of orthodontic care.
 *
 * A plain string on the treatment, not a foreign key: unlike appointment types
 * these carry no duration or pricing behaviour, and a clinic that invents its
 * own wording should not need a migration. The list below is the development
 * default offered by the UI, never a constraint the database enforces.
 */
export const DEFAULT_TREATMENT_TYPES: readonly string[] = [
  'Fixed braces',
  'Clear aligners',
  'Retainer',
  'Functional appliance',
  'Expansion treatment',
  'Mixed orthodontic treatment',
  'Other',
];

/**
 * A course of orthodontic care for one patient.
 *
 * MVP RULE — ONE CLINIC = ONE OWNER-DOCTOR: `doctorId` is resolved from the
 * clinic's ownership membership on the server, never taken from a payload. The
 * field exists so multi-practitioner clinics can arrive without a migration.
 *
 * FUTURE — APPOINTMENT LINK: appointments will eventually carry an optional
 * `treatmentId` so a monthly control can be attributed to the course it belongs
 * to. That relationship is deliberately NOT implemented here; see the handoff
 * notes. Nothing in this module imports anything from the Schedule domain.
 */
export interface TreatmentAttributes {
  /** Tenant key. Present in every single query against this collection. */
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;

  treatmentType: string;
  status: TreatmentStatus;

  /** Planned or actual first day of care. */
  startDate: Date | null;
  expectedEndDate: Date | null;
  actualEndDate: Date | null;

  notes: string | null;
  /** Agreed total in the clinic's currency. Not a balance — see cash records. */
  totalPlannedCost: number | null;

  cancellationReason: string | null;

  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TreatmentRecord = TreatmentAttributes & { _id: Types.ObjectId };

/**
 * Something that happened during a course of care.
 *
 * Deliberately lightweight: a dated note with a type. This is a longitudinal
 * diary, not clinical charting — no tooth-by-tooth data, no imaging.
 */
export const TREATMENT_EVENT_TYPES = {
  STARTED: 'STARTED',
  CHECKPOINT: 'CHECKPOINT',
  ADJUSTMENT: 'ADJUSTMENT',
  NOTE: 'NOTE',
  PAUSED: 'PAUSED',
  RESUMED: 'RESUMED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type TreatmentEventType = (typeof TREATMENT_EVENT_TYPES)[keyof typeof TREATMENT_EVENT_TYPES];

export const TREATMENT_EVENT_TYPE_VALUES = Object.values(TREATMENT_EVENT_TYPES) as [
  TreatmentEventType,
  ...TreatmentEventType[],
];

/** Event kinds a clinician may record by hand; the rest are system-generated. */
export const MANUAL_TREATMENT_EVENT_TYPES: readonly TreatmentEventType[] = [
  TREATMENT_EVENT_TYPES.CHECKPOINT,
  TREATMENT_EVENT_TYPES.ADJUSTMENT,
  TREATMENT_EVENT_TYPES.NOTE,
];

export interface TreatmentProgressAttributes {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  treatmentId: Types.ObjectId;
  /** When it happened clinically, which may not be when it was typed in. */
  occurredAt: Date;
  type: TreatmentEventType;
  note: string | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type TreatmentProgressRecord = TreatmentProgressAttributes & { _id: Types.ObjectId };

// --- inputs -----------------------------------------------------------------

export interface CreateTreatmentInput {
  clinicId: string;
  patientId: string;
  doctorId: string;
  treatmentType: string;
  status?: TreatmentStatus;
  startDate?: Date | null;
  expectedEndDate?: Date | null;
  notes?: string | null;
  totalPlannedCost?: number | null;
  createdBy: string;
}

export interface UpdateTreatmentFields {
  treatmentType?: string;
  startDate?: Date | null;
  expectedEndDate?: Date | null;
  notes?: string | null;
  totalPlannedCost?: number | null;
  updatedBy: string;
}

export interface TreatmentStatusChangeFields {
  status: TreatmentStatus;
  startDate?: Date | null;
  actualEndDate?: Date | null;
  cancellationReason?: string | null;
  updatedBy: string;
}

export interface CreateTreatmentProgressInput {
  clinicId: string;
  patientId: string;
  treatmentId: string;
  occurredAt: Date;
  type: TreatmentEventType;
  note?: string | null;
  createdBy: string;
}

// --- API shapes -------------------------------------------------------------

export interface TreatmentProgressDto {
  id: string;
  treatmentId: string;
  patientId: string;
  occurredAt: string;
  type: TreatmentEventType;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

export interface TreatmentDto {
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

  /** Days elapsed since the start, or the full span once finished. */
  durationDays: number | null;
  /** True while this course occupies the patient's single care slot. */
  isCurrent: boolean;

  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the patient profile renders: the plan plus its diary. */
export interface TreatmentWithProgressDto extends TreatmentDto {
  progress: TreatmentProgressDto[];
}

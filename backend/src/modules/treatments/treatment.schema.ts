import { z } from 'zod';
import {
  isoDateSchema,
  isoDateTimeSchema,
  objectIdSchema,
  paginationQuerySchema,
} from '../../common/validation/common.schemas.js';
import {
  MANUAL_TREATMENT_EVENT_TYPES,
  TREATMENT_EVENT_TYPE_VALUES,
  TREATMENT_STATUS_VALUES,
  type TreatmentEventType,
} from './treatment.types.js';

/** Only the human-authored event kinds may be posted; the rest are recorded by the state machine. */
const manualEventTypeSchema = z.enum(
  MANUAL_TREATMENT_EVENT_TYPES as [TreatmentEventType, ...TreatmentEventType[]],
);

const treatmentTypeSchema = z
  .string()
  .trim()
  .min(2, 'is required')
  .max(80)
  .meta({ example: 'Clear aligners' });

const treatmentNotesSchema = z.string().trim().max(2000);

const plannedCostSchema = z
  .number()
  .nonnegative()
  .max(1_000_000)
  .meta({ description: 'Agreed total in the clinic currency', example: 3200 });

export const treatmentProgressDtoSchema = z.object({
  id: objectIdSchema,
  treatmentId: objectIdSchema,
  patientId: objectIdSchema,
  occurredAt: z.string(),
  type: z.enum(TREATMENT_EVENT_TYPE_VALUES),
  note: z.string().nullable(),
  createdBy: objectIdSchema,
  createdAt: z.string(),
});

export const treatmentDtoSchema = z.object({
  id: objectIdSchema,
  clinicId: objectIdSchema,
  patientId: objectIdSchema,
  doctorId: objectIdSchema,

  treatmentType: z.string(),
  status: z.enum(TREATMENT_STATUS_VALUES),

  startDate: z.string().nullable(),
  expectedEndDate: z.string().nullable(),
  actualEndDate: z.string().nullable(),

  notes: z.string().nullable(),
  totalPlannedCost: z.number().nullable(),
  cancellationReason: z.string().nullable(),

  durationDays: z.number().int().nonnegative().nullable(),
  isCurrent: z.boolean(),

  createdBy: objectIdSchema,
  updatedBy: objectIdSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const treatmentWithProgressDtoSchema = treatmentDtoSchema.extend({
  progress: z.array(treatmentProgressDtoSchema),
});

/**
 * `clinicId`, `patientId` and `doctorId` are all absent by design: the tenant
 * comes from the verified membership, the patient from the URL, and the doctor
 * from the clinic's owner (ONE CLINIC = ONE OWNER-DOCTOR).
 */
export const createTreatmentBodySchema = z.object({
  treatmentType: treatmentTypeSchema,
  /** Omitted means PLANNED — agreeing a plan is not the same as starting it. */
  status: z.enum(['PLANNED', 'ACTIVE']).optional(),
  startDate: isoDateSchema.nullable().optional(),
  expectedEndDate: isoDateSchema.nullable().optional(),
  notes: treatmentNotesSchema.nullable().optional(),
  totalPlannedCost: plannedCostSchema.nullable().optional(),
});

/** Plan edits only. Status moves have their own endpoints so each can be audited. */
export const updateTreatmentBodySchema = z
  .object({
    treatmentType: treatmentTypeSchema.optional(),
    startDate: isoDateSchema.nullable().optional(),
    expectedEndDate: isoDateSchema.nullable().optional(),
    notes: treatmentNotesSchema.nullable().optional(),
    totalPlannedCost: plannedCostSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const startTreatmentBodySchema = z.object({
  /** Defaults to today when omitted. */
  startDate: isoDateSchema.optional(),
  note: z.string().trim().max(1000).optional(),
});

export const pauseTreatmentBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const resumeTreatmentBodySchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

export const completeTreatmentBodySchema = z.object({
  /** Defaults to today when omitted. */
  actualEndDate: isoDateSchema.optional(),
  note: z.string().trim().max(1000).optional(),
});

export const cancelTreatmentBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const createTreatmentProgressBodySchema = z.object({
  type: manualEventTypeSchema,
  /** When it happened clinically. Defaults to now; may not be in the future. */
  occurredAt: isoDateTimeSchema.optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const patientTreatmentsQuerySchema = z.object({
  status: z.enum(TREATMENT_STATUS_VALUES).optional(),
  /** Attach each treatment's timeline so the profile renders in one request. */
  includeProgress: z.stringbool().optional(),
});

export const treatmentProgressQuerySchema = paginationQuerySchema;

export const patientIdParamSchema = z.object({ patientId: objectIdSchema });
export const treatmentIdParamSchema = z.object({ treatmentId: objectIdSchema });

export type CreateTreatmentBody = z.infer<typeof createTreatmentBodySchema>;
export type UpdateTreatmentBody = z.infer<typeof updateTreatmentBodySchema>;
export type StartTreatmentBody = z.infer<typeof startTreatmentBodySchema>;
export type PauseTreatmentBody = z.infer<typeof pauseTreatmentBodySchema>;
export type ResumeTreatmentBody = z.infer<typeof resumeTreatmentBodySchema>;
export type CompleteTreatmentBody = z.infer<typeof completeTreatmentBodySchema>;
export type CancelTreatmentBody = z.infer<typeof cancelTreatmentBodySchema>;
export type CreateTreatmentProgressBody = z.infer<typeof createTreatmentProgressBodySchema>;
export type PatientTreatmentsQuery = z.infer<typeof patientTreatmentsQuerySchema>;
export type TreatmentProgressQuery = z.infer<typeof treatmentProgressQuerySchema>;
export type PatientIdParam = z.infer<typeof patientIdParamSchema>;
export type TreatmentIdParam = z.infer<typeof treatmentIdParamSchema>;

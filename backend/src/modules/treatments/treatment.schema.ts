import { z } from 'zod';
import {
  isoDateSchema,
  isoDateTimeSchema,
  objectIdSchema,
  paginationQuerySchema,
} from '../../common/validation/common.schemas.js';
import {
  MANUAL_TREATMENT_MILESTONE_TYPES,
  TREATMENT_MILESTONE_TYPE_VALUES,
  TREATMENT_STATUSES,
  TREATMENT_STATUS_VALUES,
  TREATMENT_TYPES,
  TREATMENT_TYPE_VALUES,
  type TreatmentMilestoneType,
} from './treatment.types.js';

const customTypeLabelSchema = z.string().trim().min(2).max(80);
const notesSchema = z.string().trim().max(2000);
const agreedPriceSchema = z.number().finite().nonnegative().max(1_000_000);
const milestoneTitleSchema = z.string().trim().min(2).max(120);
const milestoneDescriptionSchema = z.string().trim().max(1000);
const manualMilestoneTypeSchema = z.enum(
  MANUAL_TREATMENT_MILESTONE_TYPES as [TreatmentMilestoneType, ...TreatmentMilestoneType[]],
);

function validateCustomType(
  value: { type?: string; customTypeLabel?: string | null },
  context: z.RefinementCtx,
): void {
  if (value.type === TREATMENT_TYPES.OTHER && !value.customTypeLabel?.trim()) {
    context.addIssue({
      code: 'custom',
      path: ['customTypeLabel'],
      message: 'Custom treatment type is required when type is OTHER',
    });
  }
  if (value.type && value.type !== TREATMENT_TYPES.OTHER && value.customTypeLabel) {
    context.addIssue({
      code: 'custom',
      path: ['customTypeLabel'],
      message: 'Custom treatment type is only allowed when type is OTHER',
    });
  }
}

export const treatmentMilestoneDtoSchema = z.object({
  id: objectIdSchema,
  treatmentId: objectIdSchema,
  patientId: objectIdSchema,
  type: z.enum(TREATMENT_MILESTONE_TYPE_VALUES),
  title: z.string(),
  description: z.string().nullable(),
  occurredAt: z.string(),
  createdBy: objectIdSchema,
  updatedBy: objectIdSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const treatmentDtoSchema = z.object({
  id: objectIdSchema,
  clinicId: objectIdSchema,
  patientId: objectIdSchema,
  doctorId: objectIdSchema,
  type: z.enum(TREATMENT_TYPE_VALUES),
  customTypeLabel: z.string().nullable(),
  status: z.enum(TREATMENT_STATUS_VALUES),
  startDate: z.string().nullable(),
  expectedEndDate: z.string().nullable(),
  completedAt: z.string().nullable(),
  completionDate: z.string().nullable(),
  debondPerformed: z.boolean().nullable(),
  debondDate: z.string().nullable(),
  retentionRequired: z.boolean().nullable(),
  finalMediaIds: z.array(objectIdSchema),
  agreedPrice: z.number().nullable(),
  notes: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  durationDays: z.number().int().nonnegative().nullable(),
  isCurrent: z.boolean(),
  createdBy: objectIdSchema,
  updatedBy: objectIdSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const treatmentWithMilestonesDtoSchema = treatmentDtoSchema.extend({
  milestones: z.array(treatmentMilestoneDtoSchema),
});

export const createTreatmentBodySchema = z
  .object({
    type: z.enum(TREATMENT_TYPE_VALUES),
    customTypeLabel: customTypeLabelSchema.nullable().optional(),
    status: z.enum([TREATMENT_STATUSES.PLANNED, TREATMENT_STATUSES.ACTIVE]).optional(),
    startDate: isoDateSchema.nullable().optional(),
    expectedEndDate: isoDateSchema.nullable().optional(),
    agreedPrice: agreedPriceSchema.nullable().optional(),
    notes: notesSchema.nullable().optional(),
  })
  .superRefine(validateCustomType);

export const updateTreatmentBodySchema = z
  .object({
    type: z.enum(TREATMENT_TYPE_VALUES).optional(),
    customTypeLabel: customTypeLabelSchema.nullable().optional(),
    expectedEndDate: isoDateSchema.nullable().optional(),
    agreedPrice: agreedPriceSchema.nullable().optional(),
    notes: notesSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  })
  .superRefine(validateCustomType);

export const startTreatmentBodySchema = z.object({ startDate: isoDateSchema.optional() });
export const pauseTreatmentBodySchema = z.object({ reason: z.string().trim().max(500).optional() });
export const resumeTreatmentBodySchema = z.object({});
export const completeTreatmentBodySchema = z
  .object({
    completionDate: isoDateSchema,
    debondPerformed: z.boolean(),
    debondDate: isoDateSchema.nullable().optional(),
    retentionRequired: z.boolean(),
    finalMediaIds: z.array(objectIdSchema).max(20).default([]),
  })
  .superRefine((value, context) => {
    if (value.debondPerformed && !value.debondDate) {
      context.addIssue({
        code: 'custom',
        path: ['debondDate'],
        message: 'Debond date is required when debond was performed',
      });
    }
    if (!value.debondPerformed && value.debondDate) {
      context.addIssue({
        code: 'custom',
        path: ['debondDate'],
        message: 'Debond date must be empty when debond was not performed',
      });
    }
  });
export const cancelTreatmentBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const createTreatmentMilestoneBodySchema = z.object({
  type: manualMilestoneTypeSchema,
  title: milestoneTitleSchema,
  description: milestoneDescriptionSchema.nullable().optional(),
  occurredAt: isoDateTimeSchema.optional(),
});

export const updateTreatmentMilestoneBodySchema = z
  .object({
    title: milestoneTitleSchema.optional(),
    description: milestoneDescriptionSchema.nullable().optional(),
    occurredAt: isoDateTimeSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const patientTreatmentsQuerySchema = z.object({
  status: z.enum(TREATMENT_STATUS_VALUES).optional(),
  includeMilestones: z.stringbool().optional(),
});

export const treatmentMilestonesQuerySchema = paginationQuerySchema;
export const patientIdParamSchema = z.object({ patientId: objectIdSchema });
export const treatmentIdParamSchema = z.object({ treatmentId: objectIdSchema });
export const treatmentMilestoneIdParamSchema = z.object({
  treatmentId: objectIdSchema,
  milestoneId: objectIdSchema,
});

export type CreateTreatmentBody = z.infer<typeof createTreatmentBodySchema>;
export type UpdateTreatmentBody = z.infer<typeof updateTreatmentBodySchema>;
export type StartTreatmentBody = z.infer<typeof startTreatmentBodySchema>;
export type PauseTreatmentBody = z.infer<typeof pauseTreatmentBodySchema>;
export type ResumeTreatmentBody = z.infer<typeof resumeTreatmentBodySchema>;
export type CompleteTreatmentBody = z.infer<typeof completeTreatmentBodySchema>;
export type CancelTreatmentBody = z.infer<typeof cancelTreatmentBodySchema>;
export type CreateTreatmentMilestoneBody = z.infer<typeof createTreatmentMilestoneBodySchema>;
export type UpdateTreatmentMilestoneBody = z.infer<typeof updateTreatmentMilestoneBodySchema>;
export type PatientTreatmentsQuery = z.infer<typeof patientTreatmentsQuerySchema>;
export type TreatmentMilestonesQuery = z.infer<typeof treatmentMilestonesQuerySchema>;
export type PatientIdParam = z.infer<typeof patientIdParamSchema>;
export type TreatmentIdParam = z.infer<typeof treatmentIdParamSchema>;
export type TreatmentMilestoneIdParam = z.infer<typeof treatmentMilestoneIdParamSchema>;

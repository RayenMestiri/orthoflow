import { z } from 'zod';
import { isoDateTimeSchema, objectIdSchema } from '../../common/validation/common.schemas.js';
import {
  RETAINER_ARCH_VALUES,
  RETAINER_STATUS_VALUES,
  RETAINER_TYPES,
  RETAINER_TYPE_VALUES,
  RETENTION_STATUS_VALUES,
} from './retention.types.js';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const retainerWriteFields = {
  type: z.enum(RETAINER_TYPE_VALUES),
  customTypeLabel: z.string().trim().min(2).max(80).nullable().optional(),
  arch: z.enum(RETAINER_ARCH_VALUES),
  deliveredAt: isoDateTimeSchema.optional(),
  notes: optionalText(1000),
};
function validateCustomRetainer(
  value: { type: string; customTypeLabel?: string | null },
  context: z.RefinementCtx,
): void {
  if (value.type === RETAINER_TYPES.OTHER && !value.customTypeLabel?.trim()) {
    context.addIssue({ code: 'custom', path: ['customTypeLabel'], message: 'Custom type is required' });
  }
  if (value.type !== RETAINER_TYPES.OTHER && value.customTypeLabel) {
    context.addIssue({
      code: 'custom',
      path: ['customTypeLabel'],
      message: 'Custom type is only allowed with OTHER',
    });
  }
}

export const retainerWriteBodySchema = z.object(retainerWriteFields).superRefine(validateCustomRetainer);
export const createRetentionBodySchema = z.object({
  initialControlRecommendedAt: isoDateTimeSchema.nullable().optional(),
  notes: optionalText(2000),
  retainers: z.array(retainerWriteBodySchema).max(10).default([]),
});
export const updateRetentionBodySchema = z
  .object({
    initialControlRecommendedAt: isoDateTimeSchema.nullable().optional(),
    notes: optionalText(2000),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const closeRetentionBodySchema = z.object({ reason: optionalText(500) });

export const retainerDeviceDtoSchema = z.object({
  id: objectIdSchema,
  retentionPlanId: objectIdSchema,
  type: z.enum(RETAINER_TYPE_VALUES),
  customTypeLabel: z.string().nullable(),
  arch: z.enum(RETAINER_ARCH_VALUES),
  status: z.enum(RETAINER_STATUS_VALUES),
  deliveredAt: z.string(),
  endedAt: z.string().nullable(),
  replacesRetainerId: objectIdSchema.nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const retentionPlanDtoSchema = z.object({
  id: objectIdSchema,
  clinicId: objectIdSchema,
  patientId: objectIdSchema,
  treatmentId: objectIdSchema,
  status: z.enum(RETENTION_STATUS_VALUES),
  initialControlRecommendedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  completionReason: z.string().nullable(),
  notes: z.string().nullable(),
  retainers: z.array(retainerDeviceDtoSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const patientRetentionParamSchema = z.object({ patientId: objectIdSchema });
export const treatmentRetentionParamSchema = z.object({ treatmentId: objectIdSchema });
export const retentionPlanParamSchema = z.object({ retentionPlanId: objectIdSchema });
export const retainerParamSchema = z.object({
  retentionPlanId: objectIdSchema,
  retainerId: objectIdSchema,
});

export type CreateRetentionBody = z.infer<typeof createRetentionBodySchema>;
export type UpdateRetentionBody = z.infer<typeof updateRetentionBodySchema>;
export type RetainerWriteBody = z.infer<typeof retainerWriteBodySchema>;
export type CloseRetentionBody = z.infer<typeof closeRetentionBodySchema>;
export type PatientRetentionParam = z.infer<typeof patientRetentionParamSchema>;
export type TreatmentRetentionParam = z.infer<typeof treatmentRetentionParamSchema>;
export type RetentionPlanParam = z.infer<typeof retentionPlanParamSchema>;
export type RetainerParam = z.infer<typeof retainerParamSchema>;

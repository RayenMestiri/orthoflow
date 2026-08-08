import { z } from 'zod';
import { objectIdSchema } from '../../common/validation/common.schemas.js';

/** Hex colour used as a subtle calendar accent. */
export const appointmentTypeColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'must be a 6-digit hex colour')
  .meta({ example: '#2D765F' });

/**
 * 5 minutes is the shortest thing worth booking; 8 hours is a whole clinic day
 * and already a mistake.
 */
export const durationMinutesSchema = z
  .number()
  .int()
  .min(5, 'must be at least 5 minutes')
  .max(480, 'must be at most 8 hours');

export const appointmentTypeDtoSchema = z.object({
  id: objectIdSchema,
  clinicId: objectIdSchema,
  name: z.string(),
  durationMinutes: z.number().int(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** `clinicId` is absent on purpose: it comes from the verified tenant context. */
export const createAppointmentTypeBodySchema = z.object({
  name: z.string().trim().min(2, 'is required').max(80),
  durationMinutes: durationMinutesSchema,
  color: appointmentTypeColorSchema.nullable().optional(),
  description: z.string().trim().max(240).nullable().optional(),
});

export const updateAppointmentTypeBodySchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    durationMinutes: durationMinutesSchema.optional(),
    color: appointmentTypeColorSchema.nullable().optional(),
    description: z.string().trim().max(240).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const appointmentTypeListQuerySchema = z.object({
  /** Defaults to active only — that is what a booking form should offer. */
  includeInactive: z.stringbool().default(false),
});

export const appointmentTypeIdParamSchema = z.object({
  appointmentTypeId: objectIdSchema,
});

export type CreateAppointmentTypeBody = z.infer<typeof createAppointmentTypeBodySchema>;
export type UpdateAppointmentTypeBody = z.infer<typeof updateAppointmentTypeBodySchema>;
export type AppointmentTypeListQuery = z.infer<typeof appointmentTypeListQuerySchema>;
export type AppointmentTypeIdParam = z.infer<typeof appointmentTypeIdParamSchema>;

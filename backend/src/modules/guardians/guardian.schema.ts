import { z } from 'zod';
import {
  emailSchema,
  objectIdSchema,
  personNameSchema,
  phoneSchema,
} from '../../common/validation/common.schemas.js';
import { CONTACT_PREFERENCE_VALUES, GUARDIAN_RELATIONSHIP_VALUES } from './guardian.types.js';

export const guardianDtoSchema = z.object({
  id: objectIdSchema,
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  relationship: z.enum(GUARDIAN_RELATIONSHIP_VALUES),
  isPrimary: z.boolean(),
  financiallyResponsible: z.boolean(),
  contactPreference: z.enum(CONTACT_PREFERENCE_VALUES),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createGuardianBodySchema = z.object({
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: phoneSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  relationship: z.enum(GUARDIAN_RELATIONSHIP_VALUES),
  isPrimary: z.boolean().optional(),
  financiallyResponsible: z.boolean().optional(),
  contactPreference: z.enum(CONTACT_PREFERENCE_VALUES).optional(),
});

export const updateGuardianBodySchema = createGuardianBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const patientGuardianParamSchema = z.object({
  patientId: objectIdSchema,
  guardianId: objectIdSchema,
});

export const patientParamSchema = z.object({ patientId: objectIdSchema });

export type CreateGuardianBody = z.infer<typeof createGuardianBodySchema>;
export type UpdateGuardianBody = z.infer<typeof updateGuardianBodySchema>;
export type PatientGuardianParam = z.infer<typeof patientGuardianParamSchema>;
export type PatientParam = z.infer<typeof patientParamSchema>;

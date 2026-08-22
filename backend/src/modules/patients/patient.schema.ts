import { z } from 'zod';
import {
  emailSchema,
  isoDateSchema,
  objectIdSchema,
  paginationQuerySchema,
  personNameSchema,
  phoneSchema,
  searchQuerySchema,
} from '../../common/validation/common.schemas.js';
import { PATIENT_GENDER_VALUES, PATIENT_STATUS_VALUES } from './patient.types.js';
import {
  PATIENT_ACTIVITY_FILTER_VALUES,
  PATIENT_ACTIVITY_TARGET_VALUES,
  PATIENT_ACTIVITY_TYPE_VALUES,
} from './patient-activity.types.js';
import { CLINIC_ROLE_VALUES } from '../../common/constants/roles.js';

const patientAddressSchema = z.object({
  line1: z.string().trim().max(160).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
});

/**
 * A birth date in the future is always a typo, and orthodontics has no patients
 * older than ~120, so both ends are rejected before they reach the database.
 */
const birthDateSchema = isoDateSchema.refine(
  (value) => {
    const date = new Date(value);
    const now = Date.now();
    const oldest = now - 120 * 365.25 * 24 * 60 * 60 * 1000;
    return date.getTime() <= now && date.getTime() >= oldest;
  },
  { message: 'must be a plausible birth date in the past' },
);

export const patientDtoSchema = z.object({
  id: objectIdSchema,
  clinicId: objectIdSchema,
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  referenceNumber: z.string().nullable(),
  birthDate: z.string().nullable(),
  age: z.number().int().nonnegative().nullable(),
  gender: z.enum(PATIENT_GENDER_VALUES),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.object({
    line1: z.string().nullable(),
    city: z.string().nullable(),
    postalCode: z.string().nullable(),
    country: z.string().nullable(),
  }),
  status: z.enum(PATIENT_STATUS_VALUES),
  notes: z.string().nullable(),
  createdBy: objectIdSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  primaryGuardian: z
    .object({ id: objectIdSchema, fullName: z.string(), relationship: z.string() })
    .nullable(),
});

/**
 * `clinicId` is intentionally absent. The clinic a patient belongs to comes from
 * the caller's verified membership, never from the payload.
 */
export const createPatientBodySchema = z.object({
  firstName: personNameSchema,
  lastName: personNameSchema,
  referenceNumber: z.string().trim().min(1).max(48).nullable().optional(),
  birthDate: birthDateSchema.nullable().optional(),
  gender: z.enum(PATIENT_GENDER_VALUES).optional(),
  phone: phoneSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  address: patientAddressSchema.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const updatePatientBodySchema = createPatientBodySchema
  .partial()
  .extend({ status: z.enum(PATIENT_STATUS_VALUES).exclude(['ARCHIVED']).optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const patientListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(PATIENT_STATUS_VALUES).optional(),
  search: searchQuerySchema,
  sortBy: z.enum(['name', 'createdAt', 'birthDate']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const patientActivityDtoSchema = z.object({
  id: z.string().min(1),
  category: z.enum(['CLINICAL', 'APPOINTMENT', 'PAYMENT', 'DOCUMENT', 'TREATMENT']),
  type: z.enum(PATIENT_ACTIVITY_TYPE_VALUES),
  occurredAt: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  detail: z.string().nullable(),
  actor: z
    .object({
      id: z.string().optional(),
      displayName: z.string(),
      role: z.enum(CLINIC_ROLE_VALUES).nullable(),
    })
    .nullable(),
  treatment: z.object({ id: z.string(), label: z.string() }).nullable(),
  appointmentId: z.string().nullable(),
  clinicalVisitId: z.string().nullable(),
  cashRecordId: z.string().nullable(),
  receiptId: z.string().nullable(),
  mediaId: z.string().nullable(),
  amountMinor: z.number().int().nullable(),
  currency: z.string().nullable(),
  receiptNumber: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  recommendedAt: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  targetType: z.enum(PATIENT_ACTIVITY_TARGET_VALUES).nullable(),
  targetId: z.string().nullable(),
});

export const patientActivityQuerySchema = paginationQuerySchema.extend({
  filter: z.enum(PATIENT_ACTIVITY_FILTER_VALUES).default('ALL'),
});

export const patientIdParamSchema = z.object({
  patientId: objectIdSchema,
});

export type CreatePatientBody = z.infer<typeof createPatientBodySchema>;
export type UpdatePatientBody = z.infer<typeof updatePatientBodySchema>;
export type PatientListQuery = z.infer<typeof patientListQuerySchema>;
export type PatientActivityQuery = z.infer<typeof patientActivityQuerySchema>;
export type PatientIdParam = z.infer<typeof patientIdParamSchema>;

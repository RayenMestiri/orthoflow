import { z } from 'zod';
import {
  emailSchema,
  objectIdSchema,
  phoneSchema,
} from '../../common/validation/common.schemas.js';
import { CLINIC_STATUS_VALUES } from './clinic.types.js';

/** IANA zone name, e.g. `Africa/Tunis`. Validated for shape, not membership. */
export const timezoneSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z]+\/[A-Za-z_+-]+(\/[A-Za-z_+-]+)?$|^UTC$/, 'must be an IANA timezone')
  .meta({ example: 'Africa/Tunis' });

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'must be an ISO-4217 currency code')
  .meta({ example: 'TND' });

export const clinicAddressSchema = z.object({
  line1: z.string().trim().max(160).nullable().optional(),
  line2: z.string().trim().max(160).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
});

export const clinicNameSchema = z.string().trim().min(2, 'is required').max(120);

/** Wall-clock time in the clinic's own timezone. */
export const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a 24-hour HH:mm time')
  .meta({ example: '08:00' });

export const clinicWorkingDaySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    opensAt: clockTimeSchema,
    closesAt: clockTimeSchema,
    isClosed: z.boolean().default(false),
  })
  .refine((day) => day.isClosed || day.opensAt < day.closesAt, {
    message: 'closesAt must be later than opensAt',
    path: ['closesAt'],
  });

export const clinicScheduleSchema = z.object({
  /** 15 minutes matches short orthodontic controls; 5–60 keeps the grid sane. */
  slotMinutes: z.number().int().min(5).max(60).default(15),
  workingHours: z.array(clinicWorkingDaySchema).length(7, 'must cover all seven weekdays'),
});

/** Clinic profile as returned by the API. */
export const clinicDtoSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  slug: z.string(),
  legalName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.object({
    line1: z.string().nullable(),
    line2: z.string().nullable(),
    city: z.string().nullable(),
    postalCode: z.string().nullable(),
    country: z.string().nullable(),
  }),
  timezone: z.string(),
  currency: z.string(),
  schedule: z.object({
    slotMinutes: z.number().int(),
    workingHours: z.array(
      z.object({
        weekday: z.number().int(),
        opensAt: z.string(),
        closesAt: z.string(),
        isClosed: z.boolean(),
      }),
    ),
  }),
  status: z.enum(CLINIC_STATUS_VALUES),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const clinicIdParamSchema = z.object({
  clinicId: objectIdSchema,
});

/**
 * Note what is absent: `status`, `slug`, `createdBy`. Those are server-owned —
 * a clinic cannot un-suspend itself by PATCHing its own status.
 */
export const updateClinicBodySchema = z
  .object({
    name: clinicNameSchema.optional(),
    legalName: z.string().trim().max(160).nullable().optional(),
    email: emailSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    address: clinicAddressSchema.optional(),
    timezone: timezoneSchema.optional(),
    currency: currencySchema.optional(),
    schedule: clinicScheduleSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateClinicBody = z.infer<typeof updateClinicBodySchema>;

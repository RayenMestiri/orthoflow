import { z } from 'zod';
import { emailSchema, objectIdSchema, phoneSchema } from '../../common/validation/common.schemas.js';
import {
  MAX_CONCURRENT_CAPACITY,
  CLINIC_COMMUNICATION_CHANNELS,
  SLOT_INTERVAL_OPTIONS,
  SUPPORTED_LANGUAGES,
  WEEKDAYS,
  type TimePeriod,
} from './clinic-settings.types.js';

/** Wall-clock `HH:mm` in the clinic timezone. */
export const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a 24-hour HH:mm time')
  .meta({ example: '08:00' });

function toMinutes(clock: string): number {
  const [hours = '0', minutes = '0'] = clock.split(':');
  return Number(hours) * 60 + Number(minutes);
}

export const timePeriodSchema = z
  .object({
    start: clockTimeSchema,
    end: clockTimeSchema,
  })
  .refine((period) => toMinutes(period.start) < toMinutes(period.end), {
    message: 'end must be later than start',
    path: ['end'],
  });

/**
 * A day's opening periods.
 *
 * Empty = closed. Periods are rejected when they overlap: two shifts that
 * collide make "is the clinic open at 12:30?" ambiguous, and every consumer
 * downstream would have to guess.
 */
export const dayPeriodsSchema = z
  .array(timePeriodSchema)
  .max(4, 'a day may have at most four opening periods')
  .refine(
    (periods) => {
      const sorted = [...periods].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
      return sorted.every((period, index) => {
        const previous = sorted[index - 1];
        return !previous || toMinutes(previous.end) <= toMinutes(period.start);
      });
    },
    { message: 'opening periods on the same day must not overlap' },
  );

export const weeklyWorkingHoursSchema = z.object(
  Object.fromEntries(WEEKDAYS.map((weekday) => [weekday, dayPeriodsSchema])) as Record<
    (typeof WEEKDAYS)[number],
    typeof dayPeriodsSchema
  >,
);

/**
 * IANA zone check delegated to the runtime's own tz database — a regex would
 * happily accept `Africa/Atlantis`.
 */
export const timezoneSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .refine(
    (zone) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'must be a valid IANA timezone' },
  )
  .meta({ example: 'Africa/Tunis' });

export const schedulingSettingsSchema = z.object({
  slotIntervalMinutes: z
    .number()
    .int()
    .refine((value) => (SLOT_INTERVAL_OPTIONS as readonly number[]).includes(value), {
      message: `must be one of ${SLOT_INTERVAL_OPTIONS.join(', ')} minutes`,
    }),
  defaultAppointmentDurationMinutes: z.number().int().min(5).max(480),
  defaultConcurrentCapacity: z.number().int().min(1).max(MAX_CONCURRENT_CAPACITY),
  allowOwnerOverbooking: z.boolean(),
});

export const updateGeneralSettingsBodySchema = z
  .object({
    clinicName: z.string().trim().min(2).max(120).optional(),
    doctorDisplayName: z.string().trim().max(120).nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
    addressLine1: z.string().trim().max(160).nullable().optional(),
    city: z.string().trim().max(80).nullable().optional(),
    postalCode: z.string().trim().max(20).nullable().optional(),
    country: z.string().trim().max(80).nullable().optional(),
    timezone: timezoneSchema.optional(),
    logoUrl: z.url().max(500).nullable().optional(),
    defaultLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

/** Whole week replaced at once — a partial week would leave undefined days. */
export const updateWorkingHoursBodySchema = z.object({
  workingHours: weeklyWorkingHoursSchema,
});

export const updateSchedulingSettingsBodySchema = schedulingSettingsSchema;
export const careContinuitySettingsSchema = z.object({
  treatmentInactivityDays: z.number().int().min(14).max(365),
  retentionInactivityDays: z.number().int().min(30).max(730),
  missedAppointmentRebookGraceDays: z.number().int().min(1).max(90),
});
export const updateCareContinuitySettingsBodySchema = careContinuitySettingsSchema;
export const communicationSettingsSchema = z
  .object({
    appointmentRemindersEnabled: z.boolean(),
    reminderLeadMinutes: z.number().int().min(30).max(10080),
    channelPriority: z
      .array(z.enum(CLINIC_COMMUNICATION_CHANNELS))
      .min(1)
      .max(3)
      .refine((channels) => new Set(channels).size === channels.length, {
        message: 'channels must be unique',
      }),
    appointmentConfirmationsEnabled: z.boolean(),
    appointmentCancellationNoticesEnabled: z.boolean(),
    receiptNoticesEnabled: z.boolean(),
    consentConfirmationsEnabled: z.boolean(),
    documentShareNoticesEnabled: z.boolean(),
    defaultPhoneRegion: z.string().regex(/^[A-Z]{2}$/).nullable(),
  })
  .refine(
    (settings) =>
      !settings.channelPriority.some((channel) => channel !== 'EMAIL') ||
      settings.defaultPhoneRegion !== null,
    { message: 'defaultPhoneRegion is required for SMS or WhatsApp', path: ['defaultPhoneRegion'] },
  );
export const updateCommunicationSettingsBodySchema = communicationSettingsSchema;

// --- responses --------------------------------------------------------------

const timePeriodDtoSchema = z.object({ start: z.string(), end: z.string() });

const weeklyWorkingHoursDtoSchema = z.object(
  Object.fromEntries(
    WEEKDAYS.map((weekday) => [weekday, z.array(timePeriodDtoSchema)]),
  ) as Record<(typeof WEEKDAYS)[number], z.ZodArray<typeof timePeriodDtoSchema>>,
);

export const clinicSettingsDtoSchema = z.object({
  clinicId: objectIdSchema,
  general: z.object({
    clinicName: z.string(),
    doctorDisplayName: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    addressLine1: z.string().nullable(),
    city: z.string().nullable(),
    postalCode: z.string().nullable(),
    country: z.string().nullable(),
    timezone: z.string(),
    logoUrl: z.string().nullable(),
    defaultLanguage: z.enum(SUPPORTED_LANGUAGES),
  }),
  workingHours: weeklyWorkingHoursDtoSchema,
  scheduling: z.object({
    slotIntervalMinutes: z.number().int(),
    defaultAppointmentDurationMinutes: z.number().int(),
    defaultConcurrentCapacity: z.number().int(),
    allowOwnerOverbooking: z.boolean(),
  }),
  careContinuity: careContinuitySettingsSchema,
  communications: communicationSettingsSchema,
  updatedAt: z.string(),
});

export type UpdateGeneralSettingsBody = z.infer<typeof updateGeneralSettingsBodySchema>;
export type UpdateWorkingHoursBody = z.infer<typeof updateWorkingHoursBodySchema>;
export type UpdateSchedulingSettingsBody = z.infer<typeof updateSchedulingSettingsBodySchema>;
export type UpdateCareContinuitySettingsBody = z.infer<
  typeof updateCareContinuitySettingsBodySchema
>;
export type UpdateCommunicationSettingsBody = z.infer<typeof updateCommunicationSettingsBodySchema>;

/** Exported for tests and for the working-hours utilities. */
export function periodsOverlap(periods: TimePeriod[]): boolean {
  return !dayPeriodsSchema.safeParse(periods).success;
}

import { z } from 'zod';
import { isoDateTimeSchema, objectIdSchema } from '../../common/validation/common.schemas.js';
import { CLINIC_ROLE_VALUES } from '../../common/constants/roles.js';
import { durationMinutesSchema } from '../appointment-types/appointment-type.schema.js';
import { APPOINTMENT_STATUSES, APPOINTMENT_STATUS_VALUES } from './appointment.types.js';

const noteSchema = z.string().trim().max(1000).nullable();

const patientSummarySchema = z.object({
  id: objectIdSchema,
  fullName: z.string(),
  phone: z.string().nullable(),
  age: z.number().int().nullable(),
});

const typeSummarySchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  color: z.string().nullable(),
  durationMinutes: z.number().int(),
});

export const appointmentDtoSchema = z.object({
  id: objectIdSchema,
  clinicId: objectIdSchema,
  patientId: objectIdSchema,
  doctorId: objectIdSchema,
  appointmentTypeId: objectIdSchema,

  startAt: z.string(),
  endAt: z.string(),
  durationMinutes: z.number().int(),

  status: z.enum(APPOINTMENT_STATUS_VALUES),
  note: z.string().nullable(),

  cancellationReason: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelledBy: objectIdSchema.nullable(),
  arrivedAt: z.string().nullable(),
  treatmentStartedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  noShowAt: z.string().nullable(),
  markedNoShowBy: objectIdSchema.nullable(),
  overbookingOverride: z.boolean(),
  overbookingApprovedBy: objectIdSchema.nullable(),

  createdBy: objectIdSchema,
  updatedBy: objectIdSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),

  patient: patientSummarySchema.nullable(),
  appointmentType: typeSummarySchema.nullable(),
  slotCapacity: z.object({
    state: z.enum(['AVAILABLE', 'BUSY', 'AT_CAPACITY', 'OVERBOOKED']),
    concurrentAppointments: z.number().int(),
    recommendedCapacity: z.number().int(),
    overbookingOverride: z.boolean(),
  }),
});

/**
 * Note what is absent: `clinicId`, `doctorId`, `endAt`, `status`. Tenant and
 * doctor come from the server; the end time is derived from start + duration;
 * a new appointment is always SCHEDULED.
 */
export const createAppointmentBodySchema = z.object({
  patientId: objectIdSchema,
  appointmentTypeId: objectIdSchema,
  startAt: isoDateTimeSchema,
  durationMinutes: durationMinutesSchema.optional(),
  note: noteSchema.optional(),
  allowOverbooking: z.boolean().optional(),
});

export const updateAppointmentBodySchema = z
  .object({
    patientId: objectIdSchema.optional(),
    appointmentTypeId: objectIdSchema.optional(),
    startAt: isoDateTimeSchema.optional(),
    durationMinutes: durationMinutesSchema.optional(),
    note: noteSchema.optional(),
    allowOverbooking: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

/**
 * CANCELLED is deliberately not reachable here — cancellation has its own
 * endpoint because it carries a reason and its own audit semantics.
 */
export const changeStatusBodySchema = z.object({
  status: z.enum(
    APPOINTMENT_STATUS_VALUES.filter(
      (status) => status !== APPOINTMENT_STATUSES.CANCELLED,
    ) as [Exclude<(typeof APPOINTMENT_STATUS_VALUES)[number], 'CANCELLED'>, ...Exclude<(typeof APPOINTMENT_STATUS_VALUES)[number], 'CANCELLED'>[]],
  ),
});

export const cancelAppointmentBodySchema = z
  .object({
    reason: z.string().trim().min(2).max(500).nullable().optional(),
  })
  .optional();

export const appointmentListQuerySchema = z.object({
  start: isoDateTimeSchema,
  end: isoDateTimeSchema,
  status: z.enum(APPOINTMENT_STATUS_VALUES).optional(),
  patientId: objectIdSchema.optional(),
});

export const appointmentIdParamSchema = z.object({
  appointmentId: objectIdSchema,
});

export const appointmentActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const appointmentActivityDtoSchema = z.object({
  id: objectIdSchema,
  action: z.string(),
  actorUserId: objectIdSchema.nullable(),
  actorName: z.string(),
  actorRole: z.enum(CLINIC_ROLE_VALUES).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export type CreateAppointmentBody = z.infer<typeof createAppointmentBodySchema>;
export type UpdateAppointmentBody = z.infer<typeof updateAppointmentBodySchema>;
export type ChangeStatusBody = z.infer<typeof changeStatusBodySchema>;
export type CancelAppointmentBody = z.infer<typeof cancelAppointmentBodySchema>;
export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;
export type AppointmentIdParam = z.infer<typeof appointmentIdParamSchema>;
export type AppointmentActivityQuery = z.infer<typeof appointmentActivityQuerySchema>;

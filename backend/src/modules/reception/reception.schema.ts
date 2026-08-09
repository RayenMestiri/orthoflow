import { z } from 'zod';
import { objectIdSchema } from '../../common/validation/common.schemas.js';
import { APPOINTMENT_STATUS_VALUES } from '../appointments/appointment.types.js';

const FLOW_GROUP_VALUES = [
  'IN_TREATMENT',
  'WAITING',
  'ARRIVED',
  'LATE',
  'UPCOMING',
  'COMPLETED',
  'CLOSED',
] as const;

export const receptionRowDtoSchema = z.object({
  appointmentId: objectIdSchema,
  patientId: objectIdSchema,
  patientName: z.string(),
  appointmentTypeName: z.string(),
  treatmentLabel: z.string().nullable(),

  startAt: z.string(),
  endAt: z.string(),
  durationMinutes: z.number().int(),

  status: z.enum(APPOINTMENT_STATUS_VALUES),
  flowGroup: z.enum(FLOW_GROUP_VALUES),
  lateByMinutes: z.number().int().nonnegative().nullable(),

  arrivedAt: z.string().nullable(),
  waitingSince: z.string().nullable(),
  treatmentStartedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  noShowAt: z.string().nullable(),

  note: z.string().nullable(),
  cancellationReason: z.string().nullable(),
});

export const receptionSummaryDtoSchema = z.object({
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
  inTreatment: z.number().int().nonnegative(),
  late: z.number().int().nonnegative(),
  upcoming: z.number().int().nonnegative(),
  noShow: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
});

export const receptionBoardDtoSchema = z.object({
  date: z.string(),
  timezone: z.string(),
  generatedAt: z.string(),
  summary: receptionSummaryDtoSchema,
  rows: z.array(receptionRowDtoSchema),
});

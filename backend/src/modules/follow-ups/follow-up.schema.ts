import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from '../../common/validation/common.schemas.js';
import {
  FOLLOW_UP_FILTERS,
  FOLLOW_UP_FILTER_VALUES,
  FOLLOW_UP_SORTS,
  FOLLOW_UP_SORT_VALUES,
  FOLLOW_UP_STATE_VALUES,
} from './follow-up.types.js';
import {
  CARE_CONTINUITY_REASON_VALUES,
  CARE_CONTINUITY_STATE_VALUES,
} from './care-continuity.types.js';

export const followUpQuerySchema = paginationQuerySchema.extend({
  filter: z.enum(FOLLOW_UP_FILTER_VALUES).default(FOLLOW_UP_FILTERS.ALL),
  sort: z.enum(FOLLOW_UP_SORT_VALUES).default(FOLLOW_UP_SORTS.MOST_OVERDUE),
  search: z.string().trim().min(1).max(120).optional(),
  patientId: objectIdSchema.optional(),
  treatmentId: objectIdSchema.optional(),
});

export const followUpRowSchema = z.object({
  patient: z.object({ id: objectIdSchema, fullName: z.string(), phone: z.string().nullable() }),
  treatment: z.object({ id: objectIdSchema, label: z.string(), status: z.string() }).nullable(),
  retentionPlanId: objectIdSchema.nullable(),
  sourceVisit: z
    .object({ id: objectIdSchema, startedAt: z.string(), completedAt: z.string() })
    .nullable(),
  sourceRetentionPlan: z.object({ id: objectIdSchema, createdAt: z.string() }).nullable(),
  recommendedAt: z.string(),
  appointment: z
    .object({
      id: objectIdSchema,
      startAt: z.string(),
      endAt: z.string(),
      status: z.string(),
      appointmentType: z.string().nullable(),
    })
    .nullable(),
  state: z.enum(FOLLOW_UP_STATE_VALUES),
  daysFromRecommendation: z.number().int(),
});

export const followUpListSchema = z.object({
  summary: z.object({
    needsScheduling: z.number().int().nonnegative(),
    overdue: z.number().int().nonnegative(),
    scheduled: z.number().int().nonnegative(),
  }),
  rows: z.array(followUpRowSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    total: z.number().int().nonnegative(),
    pages: z.number().int().nonnegative(),
  }),
});

export type FollowUpQueryInput = z.infer<typeof followUpQuerySchema>;

export const careContinuityQuerySchema = paginationQuerySchema.extend({
  state: z.enum(CARE_CONTINUITY_STATE_VALUES).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

export const careContinuityListSchema = z.object({
  summary: z.object({
    needsAttention: z.number().int().nonnegative(),
    lostToFollowUp: z.number().int().nonnegative(),
  }),
  rows: z.array(
    z.object({
      patient: z.object({
        id: objectIdSchema,
        fullName: z.string(),
        phone: z.string().nullable(),
      }),
      context: z.object({
        type: z.enum(['TREATMENT', 'RETENTION']),
        treatment: z.object({ id: objectIdSchema, label: z.string() }),
        retentionPlanId: objectIdSchema.nullable(),
      }),
      state: z.enum(CARE_CONTINUITY_STATE_VALUES),
      reasons: z.array(z.enum(CARE_CONTINUITY_REASON_VALUES)),
      lastClinicalAt: z.string(),
      daysWithoutVisit: z.number().int().nonnegative(),
      recommendedAt: z.string().nullable(),
      missedAppointment: z
        .object({ id: objectIdSchema, startAt: z.string(), status: z.string() })
        .nullable(),
    }),
  ),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    total: z.number().int().nonnegative(),
    pages: z.number().int().nonnegative(),
  }),
});

export type CareContinuityQueryInput = z.infer<typeof careContinuityQuerySchema>;

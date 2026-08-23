import { z } from 'zod';
import { REPORT_PRESETS } from './reports.types.js';

export const reportQuerySchema = z.object({
  preset: z
    .enum([
      REPORT_PRESETS.THIS_MONTH,
      REPORT_PRESETS.LAST_MONTH,
      REPORT_PRESETS.LAST_3_MONTHS,
      REPORT_PRESETS.LAST_6_MONTHS,
      REPORT_PRESETS.THIS_YEAR,
      REPORT_PRESETS.CUSTOM,
    ])
    .optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type ReportQueryInput = z.infer<typeof reportQuerySchema>;

const reportPeriodSchema = z.object({
  preset: z.enum([
    REPORT_PRESETS.THIS_MONTH,
    REPORT_PRESETS.LAST_MONTH,
    REPORT_PRESETS.LAST_3_MONTHS,
    REPORT_PRESETS.LAST_6_MONTHS,
    REPORT_PRESETS.THIS_YEAR,
    REPORT_PRESETS.CUSTOM,
  ]),
  timezone: z.string(),
  from: z.string(),
  to: z.string(),
  effectiveTo: z.string(),
  fromDate: z.string(),
  toDate: z.string(),
  comparisonFrom: z.string().nullable(),
  comparisonTo: z.string().nullable(),
  bucket: z.enum(['day', 'week', 'month']),
});

const metricSchema = z.object({
  value: z.number(),
  previousValue: z.number().nullable(),
  absoluteChange: z.number().nullable(),
  percentChange: z.number().nullable(),
});

const seriesPointSchema = z.object({
  bucket: z.string(),
  value: z.number(),
  denominator: z.number().optional(),
  rate: z.number().nullable().optional(),
});

export const reportOverviewSchema = z.object({
  period: reportPeriodSchema,
  completedClinicalVisits: metricSchema,
  uniquePatientsSeen: metricSchema,
  newPatients: metricSchema,
  generatedAt: z.string(),
});

export const appointmentReportsSchema = z.object({
  period: reportPeriodSchema,
  booked: metricSchema,
  eligible: metricSchema,
  completed: metricSchema,
  cancelled: metricSchema,
  noShow: metricSchema,
  attended: metricSchema,
  unresolved: metricSchema,
  noShowRate: metricSchema,
  attendanceRate: metricSchema,
  volumeTrend: z.array(seriesPointSchema),
  noShowTrend: z.array(seriesPointSchema),
  generatedAt: z.string(),
});

export const treatmentRetentionReportsSchema = z.object({
  period: reportPeriodSchema,
  treatments: z.object({
    activeNow: z.number(),
    pausedNow: z.number(),
    started: metricSchema,
    completed: metricSchema,
    cancelled: metricSchema,
    startedTrend: z.array(seriesPointSchema),
    completedTrend: z.array(seriesPointSchema),
  }),
  retention: z.object({
    activePlansNow: z.number(),
    activeDevicesNow: z.number(),
    started: metricSchema,
    completed: metricSchema,
    replacements: metricSchema,
  }),
  generatedAt: z.string(),
});

export const financeReportsSchema = z.object({
  period: reportPeriodSchema,
  currency: z.string(),
  cashRecordedMinor: metricSchema,
  paymentCount: metricSchema,
  cancelledPaymentCount: metricSchema,
  currentSnapshot: z.object({
    outstandingMinor: z.number(),
    outstandingPatientCount: z.number(),
    totalAgreedMinor: z.number(),
    totalRecordedMinor: z.number(),
    collectedPercent: z.number(),
  }),
  cashTrend: z.array(seriesPointSchema),
  generatedAt: z.string(),
});

export const careContinuityReportsSchema = z.object({
  asOf: z.string(),
  timezone: z.string(),
  needsAttention: z.number(),
  lostToFollowUp: z.number(),
  byCareType: z.array(
    z.object({
      careType: z.enum(['TREATMENT', 'RETENTION']),
      needsAttention: z.number(),
      lostToFollowUp: z.number(),
    }),
  ),
  byReason: z.array(z.object({ reason: z.string(), count: z.number() })),
});

import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from '../../common/validation/common.schemas.js';
import {
  BALANCE_FILTERS,
  BALANCE_FILTER_VALUES,
  BALANCE_SORTS,
  BALANCE_SORT_VALUES,
  PAYMENT_STATUS_VALUES,
} from './finance.types.js';

export const financeSummaryDtoSchema = z.object({
  currency: z.string(),
  receivedTodayMinor: z.number().int().nonnegative(),
  receivedTodayCount: z.number().int().nonnegative(),
  receivedMonthMinor: z.number().int().nonnegative(),
  receivedMonthCount: z.number().int().nonnegative(),
  outstandingMinor: z.number().int().nonnegative(),
  outstandingPatientCount: z.number().int().nonnegative(),
  activeTreatmentPatientCount: z.number().int().nonnegative(),
  totalAgreedMinor: z.number().int().nonnegative(),
  totalRecordedMinor: z.number().int().nonnegative(),
  collectedPercent: z.number().int().min(0).max(100),
});

export const financeAttentionDtoSchema = z.object({
  outstandingCount: z.number().int().nonnegative(),
  noPaymentCount: z.number().int().nonnegative(),
  overpaidCount: z.number().int().nonnegative(),
  cancelledUncorrectedCount: z.number().int().nonnegative(),
  overpaidExcessMinor: z.number().int().nonnegative(),
  outstandingMinor: z.number().int().nonnegative(),
});

export const financeDistributionDtoSchema = z.object({
  paid: z.number().int().nonnegative(),
  partiallyPaid: z.number().int().nonnegative(),
  noPayment: z.number().int().nonnegative(),
  overpaid: z.number().int().nonnegative(),
  noAgreedPrice: z.number().int().nonnegative(),
  overpaidExcessMinor: z.number().int().nonnegative(),
});

export const financeOverviewDtoSchema = z.object({
  summary: financeSummaryDtoSchema,
  attention: financeAttentionDtoSchema,
  distribution: financeDistributionDtoSchema,
});

export const patientBalanceDtoSchema = z.object({
  patientId: objectIdSchema,
  patientName: z.string(),
  treatmentId: objectIdSchema,
  treatmentLabel: z.string(),
  treatmentStatus: z.string(),
  agreedMinor: z.number().int().nullable(),
  recordedMinor: z.number().int(),
  remainingMinor: z.number().int().nullable(),
  overpaidMinor: z.number().int().nullable(),
  paymentStatus: z.enum(PAYMENT_STATUS_VALUES),
  lastPaymentAt: z.string().nullable(),
});

export const financeActivityDtoSchema = z.object({
  cashRecordId: objectIdSchema,
  patientId: objectIdSchema,
  patientName: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  paymentMethod: z.string(),
  status: z.string(),
  receiptNumber: z.string().nullable(),
  receivedAt: z.string(),
  receivedByName: z.string(),
  cancelledAt: z.string().nullable(),
  cancelledByName: z.string().nullable(),
  cancellationReason: z.string().nullable(),
});

export const patientBalanceQuerySchema = paginationQuerySchema.extend({
  filter: z.enum(BALANCE_FILTER_VALUES).default(BALANCE_FILTERS.ALL),
  sort: z.enum(BALANCE_SORT_VALUES).default(BALANCE_SORTS.REMAINING_DESC),
  search: z.string().trim().min(1).max(120).optional(),
});

export const financeActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export type PatientBalanceQueryInput = z.infer<typeof patientBalanceQuerySchema>;
export type FinanceActivityQueryInput = z.infer<typeof financeActivityQuerySchema>;

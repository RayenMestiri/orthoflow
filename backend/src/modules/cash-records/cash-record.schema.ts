import { z } from 'zod';
import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQuerySchema,
} from '../../common/validation/common.schemas.js';
import {
  CASH_RECORD_STATUS_VALUES,
  PAYER_TYPES,
  PAYER_TYPE_VALUES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_VALUES,
} from './cash-record.types.js';

/**
 * The amount, as typed by a human.
 *
 * Accepted as a *string* so `150.750` reaches the server with its digits
 * intact; a JSON number would already have been through a binary float by the
 * time we saw it. A plain number is still accepted for tolerance, and both go
 * through `parseAmountToMinor`, which is the only place money is interpreted.
 */
const amountSchema = z
  .union([
    z
      .string()
      .trim()
      .regex(/^\d+([.,]\d{1,3})?$/, 'must be an amount such as 150 or 150.750'),
    z.number().positive().finite(),
  ])
  .meta({ description: 'Amount in major units, e.g. "200.000"', example: '200.000' });

/**
 * Client-generated submission id.
 *
 * The client owns this value because only the client knows that the second
 * click is the same intent as the first. The server only enforces that one key
 * yields one payment.
 */
const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'must be a URL-safe token')
  .meta({ description: 'Unique per intended payment; a retry reuses it' });

export const cashRecordDtoSchema = z.object({
  id: objectIdSchema,
  clinicId: objectIdSchema,
  patientId: objectIdSchema,
  treatmentId: objectIdSchema.nullable(),

  payerType: z.enum(PAYER_TYPE_VALUES),
  guardianId: objectIdSchema.nullable(),
  payerLabel: z.string().nullable(),
  payerName: z.string().nullable(),

  amountMinor: z.number().int(),
  amountFormatted: z.string(),
  currency: z.string(),

  paymentMethod: z.enum(PAYMENT_METHOD_VALUES),

  receivedAt: z.string(),
  receivedByUserId: objectIdSchema,
  receivedByName: z.string(),

  purpose: z.string().nullable(),
  note: z.string().nullable(),

  status: z.enum(CASH_RECORD_STATUS_VALUES),

  receiptId: objectIdSchema.nullable(),
  receiptNumber: z.string().nullable(),

  overpaymentOverride: z.boolean(),

  cancelledAt: z.string().nullable(),
  cancelledByName: z.string().nullable(),
  cancellationReason: z.string().nullable(),

  correctedByRecordId: objectIdSchema.nullable(),
  correctionOfRecordId: objectIdSchema.nullable(),

  createdAt: z.string(),
});

export const financialSummaryDtoSchema = z.object({
  patientId: objectIdSchema,
  treatmentId: objectIdSchema.nullable(),
  currency: z.string(),
  agreedAmountMinor: z.number().int().nullable(),
  recordedAmountMinor: z.number().int(),
  remainingAmountMinor: z.number().int().nullable(),
  recordCount: z.number().int().nonnegative(),
  cancelledCount: z.number().int().nonnegative(),
});

/**
 * `clinicId`, `receivedByUserId`, `createdBy`, `status`, `receiptNumber` and
 * `overpaymentApprovedBy` are all absent by design. Zod strips unknown keys, so
 * a client that sends them achieves nothing rather than escalating.
 */
export const recordPaymentBodySchema = z
  .object({
    treatmentId: objectIdSchema.nullable().optional(),

    payerType: z.enum(PAYER_TYPE_VALUES).default(PAYER_TYPES.SELF),
    guardianId: objectIdSchema.nullable().optional(),
    /** Only meaningful when `payerType` is OTHER. */
    payerLabel: z.string().trim().min(1).max(120).nullable().optional(),

    amount: amountSchema,
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES).default(PAYMENT_METHODS.CASH),

    /** Omit for "now", which is the normal case. */
    receivedAt: isoDateTimeSchema.nullable().optional(),

    purpose: z.string().trim().max(160).nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),

    idempotencyKey: idempotencyKeySchema.optional(),

    /** Explicit second submission after a PAYMENT_EXCEEDS_REMAINING_AMOUNT warning. */
    allowOverpayment: z.boolean().optional(),

    /** Set by the correction flow to link this record to the one it replaces. */
    correctionOfRecordId: objectIdSchema.optional(),
  })
  .refine((value) => value.payerType !== PAYER_TYPES.GUARDIAN || Boolean(value.guardianId), {
    message: 'guardianId is required when the payer is a guardian',
    path: ['guardianId'],
  });

export const cancelCashRecordBodySchema = z.object({
  /**
   * Mandatory. "Why was this voided?" is the question the record exists to
   * answer months later, so an empty reason is not accepted.
   */
  reason: z.string().trim().min(3, 'give a short reason for the record').max(500),
});

export const cashRecordListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CASH_RECORD_STATUS_VALUES).optional(),
  treatmentId: objectIdSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});

export const patientIdParamSchema = z.object({ patientId: objectIdSchema });
export const cashRecordIdParamSchema = z.object({ cashRecordId: objectIdSchema });
export const treatmentIdParamSchema = z.object({ treatmentId: objectIdSchema });

export type RecordPaymentBody = z.infer<typeof recordPaymentBodySchema>;
export type CancelCashRecordBody = z.infer<typeof cancelCashRecordBodySchema>;
export type CashRecordListQuery = z.infer<typeof cashRecordListQuerySchema>;
export type PatientIdParam = z.infer<typeof patientIdParamSchema>;
export type CashRecordIdParam = z.infer<typeof cashRecordIdParamSchema>;
export type TreatmentIdParam = z.infer<typeof treatmentIdParamSchema>;

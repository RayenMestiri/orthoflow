import { z } from 'zod';
import { objectIdSchema } from '../../common/validation/common.schemas.js';
import { PAYMENT_METHOD_VALUES } from '../cash-records/cash-record.types.js';
import { RECEIPT_STATUS_VALUES } from './receipt.types.js';

/**
 * Receipts are read-only over HTTP: they are issued by the cash-record service
 * inside the payment's unit of work. There is no create or update schema here
 * because there is no create or update endpoint.
 */
export const receiptDocumentDtoSchema = z.object({
  id: objectIdSchema,
  receiptNumber: z.string().meta({ example: 'REC-2026-000042' }),
  clinicId: objectIdSchema,
  patientId: objectIdSchema,
  treatmentId: objectIdSchema.nullable(),
  cashRecordId: objectIdSchema,

  amountMinor: z.number().int(),
  amountFormatted: z.string(),
  currency: z.string(),
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES),

  issuedAt: z.string(),
  issuedByName: z.string(),
  status: z.enum(RECEIPT_STATUS_VALUES),

  clinicName: z.string(),
  clinicAddress: z.string().nullable(),
  clinicPhone: z.string().nullable(),
  patientName: z.string(),
  treatmentLabel: z.string().nullable(),
  payerName: z.string().nullable(),
  cancellationReason: z.string().nullable(),
});

export const receiptIdParamSchema = z.object({ receiptId: objectIdSchema });

export type ReceiptIdParam = z.infer<typeof receiptIdParamSchema>;

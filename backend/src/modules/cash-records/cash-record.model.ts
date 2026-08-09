import { Schema, model } from 'mongoose';
import {
  CASH_RECORD_STATUSES,
  CASH_RECORD_STATUS_VALUES,
  PAYER_TYPE_VALUES,
  PAYMENT_METHOD_VALUES,
  type CashRecordAttributes,
} from './cash-record.types.js';

const cashRecordSchema = new Schema<CashRecordAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    treatmentId: { type: Schema.Types.ObjectId, ref: 'Treatment', default: null },

    payerType: { type: String, required: true, enum: PAYER_TYPE_VALUES },
    guardianId: { type: Schema.Types.ObjectId, ref: 'Guardian', default: null },
    payerLabel: { type: String, default: null, trim: true, maxlength: 120 },

    /**
     * Integer minor units. `Number` in Mongo is a double, but every value we
     * write is a safe integer produced by `parseAmountToMinor`, so no rounding
     * can occur in transit. The validator is the enforcement point.
     */
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: 'amountMinor must be an integer number of minor units',
      },
    },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },

    paymentMethod: { type: String, required: true, enum: PAYMENT_METHOD_VALUES },

    receivedAt: { type: Date, required: true },
    receivedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    purpose: { type: String, default: null, trim: true, maxlength: 160 },
    note: { type: String, default: null, trim: true, maxlength: 1000 },

    status: {
      type: String,
      required: true,
      enum: CASH_RECORD_STATUS_VALUES,
      default: CASH_RECORD_STATUSES.RECORDED,
    },

    receiptId: { type: Schema.Types.ObjectId, ref: 'Receipt', default: null },

    overpaymentOverride: { type: Boolean, required: true, default: false },
    overpaymentApprovedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    idempotencyKey: { type: String, default: null, maxlength: 64 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancellationReason: { type: String, default: null, trim: true, maxlength: 500 },

    correctedByRecordId: { type: Schema.Types.ObjectId, ref: 'CashRecord', default: null },
    correctionOfRecordId: { type: Schema.Types.ObjectId, ref: 'CashRecord', default: null },
  },
  {
    timestamps: true,
    collection: 'cashRecords',
    strict: 'throw',
    minimize: false,
  },
);

/** The patient financial workspace: this patient's ledger, newest first. */
cashRecordSchema.index({ clinicId: 1, patientId: 1, receivedAt: -1 });

/** Per-treatment totals for the financial summary. */
cashRecordSchema.index({ clinicId: 1, treatmentId: 1, receivedAt: -1 });

/** Status filters and the "cancelled records" view. */
cashRecordSchema.index({ clinicId: 1, status: 1, receivedAt: -1 });

/**
 * The idempotency guarantee.
 *
 * Partial so that the millions of records without a key do not collide on
 * `null` — a plain unique index would allow exactly one keyless record per
 * clinic, which is the opposite of what we want.
 */
cashRecordSchema.index(
  { clinicId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
    name: 'clinic_idempotency_key_unique',
  },
);

export const CashRecordModel = model<CashRecordAttributes>('CashRecord', cashRecordSchema);

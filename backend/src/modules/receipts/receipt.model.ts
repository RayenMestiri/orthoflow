import { Schema, model } from 'mongoose';
import { PAYMENT_METHOD_VALUES } from '../cash-records/cash-record.types.js';
import {
  RECEIPT_STATUSES,
  RECEIPT_STATUS_VALUES,
  type ReceiptAttributes,
} from './receipt.types.js';

const receiptSchema = new Schema<ReceiptAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    treatmentId: { type: Schema.Types.ObjectId, ref: 'Treatment', default: null },
    cashRecordId: { type: Schema.Types.ObjectId, ref: 'CashRecord', required: true },

    receiptNumber: { type: String, required: true, trim: true, maxlength: 32 },

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

    issuedAt: { type: Date, required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    status: {
      type: String,
      required: true,
      enum: RECEIPT_STATUS_VALUES,
      default: RECEIPT_STATUSES.ISSUED,
    },
  },
  {
    timestamps: true,
    collection: 'receipts',
    strict: 'throw',
    minimize: false,
  },
);

/**
 * The uniqueness guarantee behind the printed number.
 *
 * The counter already hands out distinct values; this index is the backstop
 * that turns a sequence bug into a failed write rather than two parents holding
 * receipts numbered REC-2026-000042.
 */
receiptSchema.index({ clinicId: 1, receiptNumber: 1 }, { unique: true });

/** One receipt per payment — enforced, not assumed. */
receiptSchema.index({ clinicId: 1, cashRecordId: 1 }, { unique: true });

/** A patient's receipts, newest first. */
receiptSchema.index({ clinicId: 1, patientId: 1, issuedAt: -1 });

export const ReceiptModel = model<ReceiptAttributes>('Receipt', receiptSchema);

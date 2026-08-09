import type { ClientSession, QueryFilter } from 'mongoose';
import { nextSequenceValue } from '../../infrastructure/database/counter.model.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { ReceiptModel } from './receipt.model.js';
import {
  RECEIPT_STATUSES,
  formatReceiptNumber,
  receiptCounterKey,
  type CreateReceiptInput,
  type ReceiptAttributes,
  type ReceiptRecord,
} from './receipt.types.js';

/**
 * Persistence for receipts.
 *
 * Same tenancy rule as everywhere else: `clinicId` in every filter, no lookup
 * by id alone. Receipts are append-only apart from the single status flip that
 * follows their cash record into CANCELLED.
 */
export class ReceiptRepository {
  private baseFilter(clinicId: string): QueryFilter<ReceiptAttributes> {
    return { clinicId: toObjectId(clinicId, 'clinicId') };
  }

  /**
   * Reserves the next receipt number for this clinic and year.
   *
   * Delegates to the atomic counter rather than counting documents — see
   * `counter.model.ts` for why that distinction matters. Uniqueness scope is
   * clinic + year, so two clinics may both hold a `REC-2026-000001` and neither
   * is wrong.
   */
  async reserveReceiptNumber(
    clinicId: string,
    year: number,
    session?: ClientSession,
  ): Promise<string> {
    const sequence = await nextSequenceValue(receiptCounterKey(clinicId, year), session);
    return formatReceiptNumber(year, sequence);
  }

  async create(input: CreateReceiptInput, session?: ClientSession): Promise<ReceiptRecord> {
    const [created] = await ReceiptModel.create(
      [
        {
          clinicId: toObjectId(input.clinicId, 'clinicId'),
          patientId: toObjectId(input.patientId, 'patientId'),
          treatmentId: input.treatmentId ? toObjectId(input.treatmentId, 'treatmentId') : null,
          cashRecordId: toObjectId(input.cashRecordId, 'cashRecordId'),
          receiptNumber: input.receiptNumber,
          amountMinor: input.amountMinor,
          currency: input.currency,
          paymentMethod: input.paymentMethod,
          issuedAt: input.issuedAt,
          issuedBy: toObjectId(input.issuedBy, 'issuedBy'),
          status: RECEIPT_STATUSES.ISSUED,
        },
      ],
      session ? { session } : {},
    );

    if (!created) {
      throw new Error('Receipt creation returned no document');
    }

    return created.toObject<ReceiptRecord>();
  }

  async findByIdInClinic(receiptId: string, clinicId: string): Promise<ReceiptRecord | null> {
    return ReceiptModel.findOne({
      ...this.baseFilter(clinicId),
      _id: toObjectId(receiptId, 'receiptId'),
    })
      .lean<ReceiptRecord | null>()
      .exec();
  }

  async findByCashRecord(cashRecordId: string, clinicId: string): Promise<ReceiptRecord | null> {
    return ReceiptModel.findOne({
      ...this.baseFilter(clinicId),
      cashRecordId: toObjectId(cashRecordId, 'cashRecordId'),
    })
      .lean<ReceiptRecord | null>()
      .exec();
  }

  async findManyByCashRecordIds(
    cashRecordIds: string[],
    clinicId: string,
  ): Promise<ReceiptRecord[]> {
    if (cashRecordIds.length === 0) {
      return [];
    }
    return ReceiptModel.find({
      ...this.baseFilter(clinicId),
      cashRecordId: { $in: cashRecordIds.map((id) => toObjectId(id, 'cashRecordId')) },
    })
      .lean<ReceiptRecord[]>()
      .exec();
  }

  /**
   * Marks a receipt void when its payment is cancelled.
   *
   * The amount is never touched: a receipt that has been printed and handed
   * over must keep saying what it said. Only the status changes, so anyone
   * comparing paper to screen sees the same figure plus a clear "cancelled".
   */
  async markCancelled(
    receiptId: string,
    clinicId: string,
    session?: ClientSession,
  ): Promise<ReceiptRecord | null> {
    return ReceiptModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(receiptId, 'receiptId'),
        status: RECEIPT_STATUSES.ISSUED,
      },
      { $set: { status: RECEIPT_STATUSES.CANCELLED } },
      { new: true, ...(session ? { session } : {}) },
    )
      .lean<ReceiptRecord | null>()
      .exec();
  }
}

export const receiptRepository = new ReceiptRepository();

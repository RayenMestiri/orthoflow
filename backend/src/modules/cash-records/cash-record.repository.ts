import type { ClientSession, QueryFilter } from 'mongoose';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { CashRecordModel } from './cash-record.model.js';
import {
  CASH_RECORD_STATUSES,
  type CancelCashRecordFields,
  type CashRecordAttributes,
  type CashRecordListFilters,
  type CashRecordRecord,
  type CreateCashRecordInput,
} from './cash-record.types.js';

/**
 * Persistence for cash records.
 *
 * TENANCY RULE (AGENTS.md §5.3): `clinicId` is a required parameter of every
 * method and always lands in the filter. There is no `findById(cashRecordId)`,
 * because one clinic reading another clinic's money is the single worst bug
 * this product could ship.
 *
 * There is also no `delete` and no general-purpose `update`. The only mutations
 * are the ones the domain allows: cancel, attach a receipt, and link a
 * correction.
 */
export class CashRecordRepository {
  private baseFilter(clinicId: string): QueryFilter<CashRecordAttributes> {
    return { clinicId: toObjectId(clinicId, 'clinicId') };
  }

  async findByIdInClinic(cashRecordId: string, clinicId: string): Promise<CashRecordRecord | null> {
    return CashRecordModel.findOne({
      ...this.baseFilter(clinicId),
      _id: toObjectId(cashRecordId, 'cashRecordId'),
    })
      .lean<CashRecordRecord | null>()
      .exec();
  }

  /** The replay lookup: same key in the same clinic means the same payment. */
  async findByIdempotencyKey(
    idempotencyKey: string,
    clinicId: string,
  ): Promise<CashRecordRecord | null> {
    return CashRecordModel.findOne({ ...this.baseFilter(clinicId), idempotencyKey })
      .lean<CashRecordRecord | null>()
      .exec();
  }

  async listByClinic(
    clinicId: string,
    filters: CashRecordListFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CashRecordRecord>> {
    const filter = this.toFilter(clinicId, filters);

    const [items, total] = await Promise.all([
      CashRecordModel.find(filter)
        .sort({ receivedAt: -1, createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<CashRecordRecord[]>()
        .exec(),
      CashRecordModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  /**
   * Sums RECORDED money, in the database rather than in Node.
   *
   * Aggregating here means the total is correct for a patient with ten years of
   * history without ever loading ten years of documents, and cancelled records
   * are excluded by the filter rather than by remembering to skip them.
   */
  async sumRecordedMinor(
    clinicId: string,
    filters: { patientId: string; treatmentId?: string },
  ): Promise<{ totalMinor: number; recordCount: number }> {
    const [result] = await CashRecordModel.aggregate<{ totalMinor: number; recordCount: number }>([
      {
        $match: this.toFilter(clinicId, {
          ...filters,
          status: CASH_RECORD_STATUSES.RECORDED,
        }),
      },
      {
        $group: {
          _id: null,
          totalMinor: { $sum: '$amountMinor' },
          recordCount: { $sum: 1 },
        },
      },
    ]).exec();

    return { totalMinor: result?.totalMinor ?? 0, recordCount: result?.recordCount ?? 0 };
  }

  async countByStatus(
    clinicId: string,
    filters: { patientId: string; treatmentId?: string },
    status: CashRecordAttributes['status'],
  ): Promise<number> {
    return CashRecordModel.countDocuments(this.toFilter(clinicId, { ...filters, status })).exec();
  }

  async create(input: CreateCashRecordInput, session?: ClientSession): Promise<CashRecordRecord> {
    const [created] = await CashRecordModel.create(
      [
        {
          // Tenant, actor and status all come from verified server context.
          clinicId: toObjectId(input.clinicId, 'clinicId'),
          patientId: toObjectId(input.patientId, 'patientId'),
          treatmentId: input.treatmentId ? toObjectId(input.treatmentId, 'treatmentId') : null,

          payerType: input.payerType,
          guardianId: input.guardianId ? toObjectId(input.guardianId, 'guardianId') : null,
          payerLabel: input.payerLabel ?? null,

          amountMinor: input.amountMinor,
          currency: input.currency,
          paymentMethod: input.paymentMethod,

          receivedAt: input.receivedAt,
          receivedByUserId: toObjectId(input.receivedByUserId, 'receivedByUserId'),

          purpose: input.purpose ?? null,
          note: input.note ?? null,

          status: CASH_RECORD_STATUSES.RECORDED,
          receiptId: null,

          overpaymentOverride: input.overpaymentOverride ?? false,
          overpaymentApprovedBy: input.overpaymentApprovedBy
            ? toObjectId(input.overpaymentApprovedBy, 'overpaymentApprovedBy')
            : null,

          idempotencyKey: input.idempotencyKey ?? null,

          createdBy: toObjectId(input.createdBy, 'createdBy'),

          cancelledAt: null,
          cancelledBy: null,
          cancellationReason: null,
          correctedByRecordId: null,
          correctionOfRecordId: input.correctionOfRecordId
            ? toObjectId(input.correctionOfRecordId, 'correctionOfRecordId')
            : null,
        },
      ],
      session ? { session } : {},
    );

    if (!created) {
      throw new Error('Cash record creation returned no document');
    }

    return created.toObject<CashRecordRecord>();
  }

  async attachReceipt(
    cashRecordId: string,
    clinicId: string,
    receiptId: string,
    session?: ClientSession,
  ): Promise<CashRecordRecord | null> {
    return CashRecordModel.findOneAndUpdate(
      { ...this.baseFilter(clinicId), _id: toObjectId(cashRecordId, 'cashRecordId') },
      { $set: { receiptId: toObjectId(receiptId, 'receiptId') } },
      { new: true, ...(session ? { session } : {}) },
    )
      .lean<CashRecordRecord | null>()
      .exec();
  }

  /**
   * Voids a record.
   *
   * `status: RECORDED` is part of the filter, so a second cancel matches no
   * document rather than re-stamping the timestamp and reason. The service
   * turns that miss into `CASH_RECORD_ALREADY_CANCELLED`.
   */
  async cancel(
    cashRecordId: string,
    clinicId: string,
    changes: CancelCashRecordFields,
    session?: ClientSession,
  ): Promise<CashRecordRecord | null> {
    return CashRecordModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(cashRecordId, 'cashRecordId'),
        status: CASH_RECORD_STATUSES.RECORDED,
      },
      {
        $set: {
          status: CASH_RECORD_STATUSES.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: toObjectId(changes.cancelledBy, 'cancelledBy'),
          cancellationReason: changes.cancellationReason,
        },
      },
      { new: true, ...(session ? { session } : {}) },
    )
      .lean<CashRecordRecord | null>()
      .exec();
  }

  /** Points a cancelled record forward at the record that replaced it. */
  async linkCorrection(
    originalRecordId: string,
    clinicId: string,
    correctionRecordId: string,
    session?: ClientSession,
  ): Promise<void> {
    await CashRecordModel.updateOne(
      { ...this.baseFilter(clinicId), _id: toObjectId(originalRecordId, 'originalRecordId') },
      { $set: { correctedByRecordId: toObjectId(correctionRecordId, 'correctionRecordId') } },
      session ? { session } : {},
    ).exec();
  }

  private toFilter(
    clinicId: string,
    filters: CashRecordListFilters,
  ): QueryFilter<CashRecordAttributes> {
    const filter: QueryFilter<CashRecordAttributes> = this.baseFilter(clinicId);

    if (filters.patientId !== undefined) {
      filter.patientId = toObjectId(filters.patientId, 'patientId');
    }
    if (filters.treatmentId !== undefined) {
      filter.treatmentId = toObjectId(filters.treatmentId, 'treatmentId');
    }
    if (filters.status !== undefined) {
      filter.status = filters.status;
    }
    if (filters.from !== undefined || filters.to !== undefined) {
      filter.receivedAt = {
        ...(filters.from ? { $gte: filters.from } : {}),
        ...(filters.to ? { $lte: filters.to } : {}),
      };
    }

    return filter;
  }
}

export const cashRecordRepository = new CashRecordRepository();

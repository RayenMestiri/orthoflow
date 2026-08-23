import type { PipelineStage, Types } from 'mongoose';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { escapeRegex } from '../../infrastructure/database/query.helpers.js';
import { CashRecordModel } from '../cash-records/cash-record.model.js';
import { CASH_RECORD_STATUSES } from '../cash-records/cash-record.types.js';
import { TreatmentModel } from '../treatments/treatment.model.js';
import {
  BALANCE_FILTERS,
  BALANCE_SORTS,
  type BalanceFilter,
  type BalanceSort,
  type PatientBalanceQuery,
} from './finance.types.js';

/** Raw aggregation output, before the service derives status and formats ids. */
export interface PatientBalanceAggregate {
  _id: Types.ObjectId;
  patientId: Types.ObjectId;
  patientFirstName: string;
  patientLastName: string;
  treatmentType: string;
  customTypeLabel: string | null;
  treatmentStatus: string;
  agreedPrice: number | null;
  recordedMinor: number;
  lastPaymentAt: Date | null;
}

/** Clinic-wide totals and the derived-status histogram, from one group stage. */
export interface BalanceTotals {
  outstandingMinor: number;
  outstandingPatientIds: string[];
  /** Agreed and recorded across priced treatments only, so the ratio is fair. */
  totalAgreedMinor: number;
  totalRecordedMinor: number;
  noPaymentCount: number;
  paidCount: number;
  partiallyPaidCount: number;
  noAgreedPriceCount: number;
  overpaidCount: number;
  overpaidExcessMinor: number;
  activeTreatmentPatientIds: string[];
}

/** One recent movement, with the patient joined in and ids still as ObjectIds. */
export interface FinanceActivityAggregate {
  _id: Types.ObjectId;
  patientId: Types.ObjectId;
  patientFirstName: string;
  patientLastName: string;
  amountMinor: number;
  currency: string;
  paymentMethod: string;
  status: string;
  receivedAt: Date;
  receivedByUserId: Types.ObjectId;
  cancelledAt: Date | null;
  cancelledBy: Types.ObjectId | null;
  cancellationReason: string | null;
}

export interface RecordedCashReportAggregate {
  totalMinor: number;
  count: number;
  series: Array<{ bucket: Date; value: number; count: number }>;
}

/**
 * Read-side aggregations for the clinic financial workspace.
 *
 * DESIGN NOTE — WHY AGGREGATION AND NOT LOOPS: the obvious implementation
 * fetches every treatment and then queries cash records once per treatment.
 * That is N+1 against the two largest collections in the product and it gets
 * slower every month the clinic operates. Every method here resolves in a
 * single round trip, with `clinicId` as the first stage so the compound indexes
 * on both collections do the work.
 *
 * TENANCY: `clinicId` is the first `$match` of every pipeline, without
 * exception. An aggregation missing it would read the whole platform.
 */
export class FinanceRepository {
  /**
   * Joins treatments to their recorded money.
   *
   * The `$lookup` sub-pipeline sums only RECORDED cash records, so cancelled
   * ones contribute zero without any post-filtering — the ledger rule is
   * enforced inside the database rather than remembered in TypeScript.
   */
  private balanceStages(clinicId: string, patientId?: string): PipelineStage[] {
    return [
      {
        $match: {
          clinicId: toObjectId(clinicId, 'clinicId'),
          // Narrowed here rather than after the joins, so a single-patient
          // lookup rides the (clinicId, patientId) index instead of walking
          // every treatment in the clinic.
          ...(patientId ? { patientId: toObjectId(patientId, 'patientId') } : {}),
        },
      },
      {
        $lookup: {
          from: 'cashRecords',
          let: { treatmentId: '$_id', clinicId: '$clinicId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$clinicId', '$$clinicId'] },
                    { $eq: ['$treatmentId', '$$treatmentId'] },
                    { $eq: ['$status', CASH_RECORD_STATUSES.RECORDED] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                recordedMinor: { $sum: '$amountMinor' },
                lastPaymentAt: { $max: '$receivedAt' },
              },
            },
          ],
          as: 'money',
        },
      },
      {
        $lookup: {
          from: 'patients',
          localField: 'patientId',
          foreignField: '_id',
          as: 'patient',
        },
      },
      { $unwind: '$patient' },
      {
        $addFields: {
          recordedMinor: { $ifNull: [{ $first: '$money.recordedMinor' }, 0] },
          lastPaymentAt: { $ifNull: [{ $first: '$money.lastPaymentAt' }, null] },
          patientFirstName: '$patient.firstName',
          patientLastName: '$patient.lastName',
          patientPhone: '$patient.phone',
          treatmentStatus: '$status',
          /**
           * Agreed price is stored in major units by the Treatment module.
           * Converting here — in the read model — keeps the comparison with
           * `amountMinor` honest without writing to a domain we do not own.
           * Three decimals matches the money utility's TND exponent.
           */
          agreedMinor: {
            $cond: [
              { $gt: ['$agreedPrice', 0] },
              { $round: [{ $multiply: ['$agreedPrice', 1000] }, 0] },
              null,
            ],
          },
        },
      },
      {
        $addFields: {
          remainingMinor: {
            $cond: [{ $ne: ['$agreedMinor', null] }, { $subtract: ['$agreedMinor', '$recordedMinor'] }, null],
          },
        },
      },
    ];
  }

  /** Translates a table filter into the matching derived-status predicate. */
  private filterStage(filter: BalanceFilter): PipelineStage[] {
    switch (filter) {
      case BALANCE_FILTERS.OUTSTANDING:
        return [{ $match: { agreedMinor: { $ne: null }, remainingMinor: { $gt: 0 } } }];
      case BALANCE_FILTERS.PAID:
        return [{ $match: { agreedMinor: { $ne: null }, remainingMinor: 0 } }];
      case BALANCE_FILTERS.NO_PAYMENT:
        return [{ $match: { agreedMinor: { $ne: null }, recordedMinor: 0 } }];
      case BALANCE_FILTERS.OVERPAID:
        return [{ $match: { agreedMinor: { $ne: null }, remainingMinor: { $lt: 0 } } }];
      default:
        return [];
    }
  }

  private searchStage(search?: string): PipelineStage[] {
    if (!search || search.trim().length === 0) {
      return [];
    }
    // Escaped before it becomes a regex — see the query-injection policy.
    const term = new RegExp(escapeRegex(search.trim()), 'i');
    return [
      {
        $match: {
          $or: [
            { patientFirstName: term },
            { patientLastName: term },
            { patientPhone: term },
          ],
        },
      },
    ];
  }

  private sortStage(sort: BalanceSort): PipelineStage.Sort {
    switch (sort) {
      case BALANCE_SORTS.REMAINING_ASC:
        return { $sort: { remainingMinor: 1, _id: 1 } };
      case BALANCE_SORTS.RECENTLY_PAID:
        return { $sort: { lastPaymentAt: -1, _id: 1 } };
      case BALANCE_SORTS.PATIENT_NAME:
        return { $sort: { patientLastName: 1, patientFirstName: 1, _id: 1 } };
      default:
        // Highest remaining first: what an owner reviewing debt wants to see.
        return { $sort: { remainingMinor: -1, _id: 1 } };
    }
  }

  /**
   * One page of balance rows plus the total, in a single round trip.
   *
   * `$facet` runs the count and the page over the same filtered set, so the two
   * can never disagree — a separate count query could see different data.
   */
  async listPatientBalances(
    clinicId: string,
    query: PatientBalanceQuery,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PatientBalanceAggregate>> {
    const [result] = await TreatmentModel.aggregate<{
      items: PatientBalanceAggregate[];
      total: { count: number }[];
    }>([
      ...this.balanceStages(clinicId, query.patientId),
      ...this.searchStage(query.search),
      ...this.filterStage(query.filter ?? BALANCE_FILTERS.ALL),
      {
        $facet: {
          items: [
            this.sortStage(query.sort ?? BALANCE_SORTS.REMAINING_DESC),
            { $skip: pagination.skip },
            { $limit: pagination.limit },
            {
              $project: {
                patientId: 1,
                patientFirstName: 1,
                patientLastName: 1,
                treatmentType: '$type',
                customTypeLabel: 1,
                treatmentStatus: 1,
                agreedPrice: 1,
                recordedMinor: 1,
                lastPaymentAt: 1,
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]).exec();

    return {
      items: result?.items ?? [],
      total: result?.total[0]?.count ?? 0,
    };
  }

  /**
   * Money received in a window, from the ledger only.
   *
   * Cancelled records are excluded by the match, so a cancellation immediately
   * lowers the figure the dashboard shows.
   */
  async sumReceivedBetween(
    clinicId: string,
    from: Date,
    to: Date,
  ): Promise<{ totalMinor: number; count: number }> {
    const [result] = await CashRecordModel.aggregate<{ totalMinor: number; count: number }>([
      {
        $match: {
          clinicId: toObjectId(clinicId, 'clinicId'),
          status: CASH_RECORD_STATUSES.RECORDED,
          receivedAt: { $gte: from, $lt: to },
        },
      },
      { $group: { _id: null, totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
    ]).exec();

    return { totalMinor: result?.totalMinor ?? 0, count: result?.count ?? 0 };
  }

  /**
   * The counters behind the summary and the worklist, in one pass.
   *
   * Everything is computed from the same joined set, so "12 outstanding" in the
   * attention strip and the Outstanding filter always return the same rows.
   */
  async aggregateBalanceTotals(clinicId: string): Promise<BalanceTotals> {
    const [result] = await TreatmentModel.aggregate<
      Omit<BalanceTotals, 'outstandingPatientIds' | 'activeTreatmentPatientIds'> & {
        outstandingPatientIds: unknown[];
        activeTreatmentPatientIds: unknown[];
      }
    >([
      ...this.balanceStages(clinicId),
      {
        $group: {
          _id: null,
          outstandingMinor: {
            $sum: { $cond: [{ $gt: ['$remainingMinor', 0] }, '$remainingMinor', 0] },
          },
          outstandingPatientIds: {
            $addToSet: { $cond: [{ $gt: ['$remainingMinor', 0] }, '$patientId', '$$REMOVE'] },
          },
          /**
           * Clinic-wide agreed and recorded totals, plus the status histogram.
           *
           * Added for the collection-health and distribution panels. These are
           * extra accumulators on the group stage that already walks this set,
           * so there is no second query and no extra index pressure. Only
           * priced treatments contribute, so the ratio compares like with like.
           */
          totalAgreedMinor: {
            $sum: { $cond: [{ $ne: ['$agreedMinor', null] }, '$agreedMinor', 0] },
          },
          totalRecordedMinor: {
            $sum: { $cond: [{ $ne: ['$agreedMinor', null] }, '$recordedMinor', 0] },
          },
          noPaymentCount: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$agreedMinor', null] }, { $eq: ['$recordedMinor', 0] }] },
                1,
                0,
              ],
            },
          },
          /** Exactly settled. Mirrors `derivePaymentStatus`'s PAID branch. */
          paidCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$agreedMinor', null] },
                    { $gt: ['$recordedMinor', 0] },
                    { $eq: ['$remainingMinor', 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          partiallyPaidCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$agreedMinor', null] },
                    { $gt: ['$recordedMinor', 0] },
                    { $gt: ['$remainingMinor', 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          noAgreedPriceCount: {
            $sum: { $cond: [{ $eq: ['$agreedMinor', null] }, 1, 0] },
          },
          overpaidCount: {
            $sum: { $cond: [{ $lt: ['$remainingMinor', 0] }, 1, 0] },
          },
          overpaidExcessMinor: {
            $sum: { $cond: [{ $lt: ['$remainingMinor', 0] }, { $abs: '$remainingMinor' }, 0] },
          },
          activeTreatmentPatientIds: {
            $addToSet: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, '$patientId', '$$REMOVE'] },
          },
        },
      },
    ]).exec();

    return {
      outstandingMinor: result?.outstandingMinor ?? 0,
      outstandingPatientIds: (result?.outstandingPatientIds ?? []).map(String),
      totalAgreedMinor: result?.totalAgreedMinor ?? 0,
      totalRecordedMinor: result?.totalRecordedMinor ?? 0,
      noPaymentCount: result?.noPaymentCount ?? 0,
      paidCount: result?.paidCount ?? 0,
      partiallyPaidCount: result?.partiallyPaidCount ?? 0,
      noAgreedPriceCount: result?.noAgreedPriceCount ?? 0,
      overpaidCount: result?.overpaidCount ?? 0,
      overpaidExcessMinor: result?.overpaidExcessMinor ?? 0,
      activeTreatmentPatientIds: (result?.activeTreatmentPatientIds ?? []).map(String),
    };
  }

  /**
   * Cancelled records that no later record claims to correct.
   *
   * Deliberately a count of things "worth a look" — a cancellation with no
   * correction is often perfectly final.
   */
  async countCancelledWithoutCorrection(clinicId: string): Promise<number> {
    return CashRecordModel.countDocuments({
      clinicId: toObjectId(clinicId, 'clinicId'),
      status: CASH_RECORD_STATUSES.CANCELLED,
      correctedByRecordId: null,
    }).exec();
  }

  /** Newest financial movements clinic-wide, with the patient name joined in. */
  async listRecentActivity(
    clinicId: string,
    limit: number,
  ): Promise<FinanceActivityAggregate[]> {
    return CashRecordModel.aggregate<FinanceActivityAggregate>([
      { $match: { clinicId: toObjectId(clinicId, 'clinicId') } },
      { $sort: { updatedAt: -1, receivedAt: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'patients',
          localField: 'patientId',
          foreignField: '_id',
          as: 'patient',
        },
      },
      { $unwind: { path: '$patient', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          patientFirstName: { $ifNull: ['$patient.firstName', ''] },
          patientLastName: { $ifNull: ['$patient.lastName', ''] },
        },
      },
      { $project: { patient: 0 } },
    ]).exec();
  }

  /** Period reporting over the same authoritative RECORDED ledger rows as Finance. */
  async aggregateRecordedBetween(
    clinicId: string,
    from: Date,
    to: Date,
    bucket: 'day' | 'week' | 'month',
    timezone: string,
  ): Promise<RecordedCashReportAggregate> {
    const [result] = await CashRecordModel.aggregate<{
      totals: Array<{ totalMinor: number; count: number }>;
      series: Array<{ bucket: Date; value: number; count: number }>;
    }>([
      {
        $match: {
          clinicId: toObjectId(clinicId, 'clinicId'),
          status: CASH_RECORD_STATUSES.RECORDED,
          receivedAt: { $gte: from, $lt: to },
        },
      },
      {
        $facet: {
          totals: [
            { $group: { _id: null, totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
            { $project: { _id: 0 } },
          ],
          series: [
            {
              $group: {
                _id: {
                  $dateTrunc: {
                    date: '$receivedAt',
                    unit: bucket,
                    timezone,
                    ...(bucket === 'week' ? { startOfWeek: 'monday' } : {}),
                  },
                },
                value: { $sum: '$amountMinor' },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, bucket: '$_id', value: 1, count: 1 } },
          ],
        },
      },
    ] as PipelineStage[]).exec();

    return {
      totalMinor: result?.totals[0]?.totalMinor ?? 0,
      count: result?.totals[0]?.count ?? 0,
      series: result?.series ?? [],
    };
  }

  async countCancelledBetween(clinicId: string, from: Date, to: Date): Promise<number> {
    return CashRecordModel.countDocuments({
      clinicId: toObjectId(clinicId, 'clinicId'),
      status: CASH_RECORD_STATUSES.CANCELLED,
      cancelledAt: { $gte: from, $lt: to },
    }).exec();
  }
}

export const financeRepository = new FinanceRepository();

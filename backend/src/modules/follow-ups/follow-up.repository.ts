import type { PipelineStage, Types } from 'mongoose';
import type { PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { escapeRegex } from '../../infrastructure/database/query.helpers.js';
import { ClinicalVisitModel } from '../clinical-visits/clinical-visit.model.js';
import { CLINICAL_VISIT_STATUSES } from '../clinical-visits/clinical-visit.types.js';
import { DUE_SOON_DAYS, NON_QUALIFYING_FOLLOW_UP_STATUSES } from './follow-up.rules.js';
import { FOLLOW_UP_FILTERS, FOLLOW_UP_SORTS, type FollowUpState } from './follow-up.types.js';

export interface FollowUpAggregateRow {
  patientId: Types.ObjectId;
  patientFirstName: string;
  patientLastName: string;
  patientPhone: string | null;
  treatmentId: Types.ObjectId | null;
  treatmentType: string | null;
  treatmentCustomLabel: string | null;
  treatmentStatus: string | null;
  visitId: Types.ObjectId;
  visitStartedAt: Date;
  visitCompletedAt: Date;
  recommendedAt: Date;
  appointmentId: Types.ObjectId | null;
  appointmentStartAt: Date | null;
  appointmentEndAt: Date | null;
  appointmentStatus: string | null;
  appointmentType: string | null;
  state: FollowUpState;
  daysFromRecommendation: number;
}

interface FollowUpFacetResult {
  summary: Array<{ needsScheduling: number; overdue: number; scheduled: number }>;
  rows: FollowUpAggregateRow[];
  total: Array<{ count: number }>;
}

export interface FollowUpReadQuery {
  filter: string;
  sort: string;
  search?: string;
  patientId?: string;
  treatmentId?: string;
}

export class FollowUpRepository {
  async list(
    clinicId: string,
    timezone: string,
    now: Date,
    query: FollowUpReadQuery,
    pagination: PaginationParams,
  ): Promise<FollowUpFacetResult> {
    const clinicObjectId = toObjectId(clinicId, 'clinicId');
    const initialMatch: Record<string, unknown> = {
      clinicId: clinicObjectId,
      status: CLINICAL_VISIT_STATUSES.COMPLETED,
      nextVisitRecommendedAt: { $ne: null },
    };
    if (query.patientId) initialMatch.patientId = toObjectId(query.patientId, 'patientId');
    if (query.treatmentId) initialMatch.treatmentId = toObjectId(query.treatmentId, 'treatmentId');

    const searchMatch: PipelineStage[] = query.search
      ? [
          {
            $match: {
              $or: [
                { 'patient.firstName': { $regex: escapeRegex(query.search), $options: 'i' } },
                { 'patient.lastName': { $regex: escapeRegex(query.search), $options: 'i' } },
                { 'patient.phone': { $regex: escapeRegex(query.search), $options: 'i' } },
              ],
            },
          },
        ]
      : [];

    const sort: Record<string, 1 | -1> =
      query.sort === FOLLOW_UP_SORTS.PATIENT_NAME
        ? { patientLastName: 1, patientFirstName: 1 }
        : query.sort === FOLLOW_UP_SORTS.RECENTLY_VISITED
          ? { visitStartedAt: -1 }
          : query.sort === FOLLOW_UP_SORTS.RECOMMENDATION_DATE
            ? { recommendedAt: 1 }
            : { daysFromRecommendation: -1, recommendedAt: 1 };

    const rowFilter: PipelineStage.FacetPipelineStage[] =
      query.filter === FOLLOW_UP_FILTERS.ALL
        ? []
        : query.filter === FOLLOW_UP_FILTERS.NEEDS_SCHEDULING
          ? [{ $match: { state: { $in: ['NEEDS_SCHEDULING', 'DUE_SOON'] } } }]
          : [{ $match: { state: query.filter } }];

    const [result] = await ClinicalVisitModel.aggregate<FollowUpFacetResult>([
      { $match: initialMatch },
      { $sort: { completedAt: -1, createdAt: -1 } },
      {
        $group: {
          _id: { patientId: '$patientId', treatmentId: { $ifNull: ['$treatmentId', null] } },
          visit: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$visit' } },
      {
        $lookup: {
          from: 'patients',
          let: { patientId: '$patientId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$_id', '$$patientId'] }, { $eq: ['$clinicId', clinicObjectId] }],
                },
              },
            },
            { $project: { firstName: 1, lastName: 1, phone: 1 } },
          ],
          as: 'patient',
        },
      },
      { $unwind: '$patient' },
      ...searchMatch,
      {
        $lookup: {
          from: 'treatments',
          let: { treatmentId: '$treatmentId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ['$$treatmentId', null] },
                    { $eq: ['$_id', '$$treatmentId'] },
                    { $eq: ['$clinicId', clinicObjectId] },
                  ],
                },
              },
            },
            { $project: { type: 1, customTypeLabel: 1, status: 1 } },
          ],
          as: 'treatment',
        },
      },
      { $unwind: { path: '$treatment', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'appointments',
          let: { patientId: '$patientId', treatmentId: '$treatmentId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$clinicId', clinicObjectId] },
                    { $eq: ['$patientId', '$$patientId'] },
                    { $gte: ['$startAt', now] },
                    {
                      $not: {
                        $in: ['$status', [...NON_QUALIFYING_FOLLOW_UP_STATUSES]],
                      },
                    },
                    {
                      $cond: [
                        { $ne: ['$$treatmentId', null] },
                        { $eq: ['$treatmentId', '$$treatmentId'] },
                        { $eq: [{ $ifNull: ['$treatmentId', null] }, null] },
                      ],
                    },
                  ],
                },
              },
            },
            { $sort: { startAt: 1 } },
            { $limit: 1 },
          ],
          as: 'appointment',
        },
      },
      { $set: { appointment: { $first: '$appointment' } } },
      {
        $lookup: {
          from: 'appointmentTypes',
          localField: 'appointment.appointmentTypeId',
          foreignField: '_id',
          as: 'appointmentTypeRecord',
        },
      },
      { $set: { appointmentTypeRecord: { $first: '$appointmentTypeRecord' } } },
      {
        $set: {
          daysFromRecommendation: {
            $dateDiff: {
              startDate: { $dateTrunc: { date: '$nextVisitRecommendedAt', unit: 'day', timezone } },
              endDate: { $dateTrunc: { date: now, unit: 'day', timezone } },
              unit: 'day',
              timezone,
            },
          },
        },
      },
      {
        $set: {
          state: {
            $switch: {
              branches: [
                {
                  case: { $ne: [{ $ifNull: ['$appointment._id', null] }, null] },
                  then: 'SCHEDULED',
                },
                { case: { $gt: ['$daysFromRecommendation', 0] }, then: 'OVERDUE' },
                { case: { $gte: ['$daysFromRecommendation', -DUE_SOON_DAYS] }, then: 'DUE_SOON' },
              ],
              default: 'NEEDS_SCHEDULING',
            },
          },
        },
      },
      {
        $project: {
          patientId: 1,
          patientFirstName: '$patient.firstName',
          patientLastName: '$patient.lastName',
          patientPhone: { $ifNull: ['$patient.phone', null] },
          treatmentId: { $ifNull: ['$treatmentId', null] },
          treatmentType: { $ifNull: ['$treatment.type', null] },
          treatmentCustomLabel: { $ifNull: ['$treatment.customTypeLabel', null] },
          treatmentStatus: { $ifNull: ['$treatment.status', null] },
          visitId: '$_id',
          visitStartedAt: '$startedAt',
          visitCompletedAt: '$completedAt',
          recommendedAt: '$nextVisitRecommendedAt',
          appointmentId: { $ifNull: ['$appointment._id', null] },
          appointmentStartAt: { $ifNull: ['$appointment.startAt', null] },
          appointmentEndAt: { $ifNull: ['$appointment.endAt', null] },
          appointmentStatus: { $ifNull: ['$appointment.status', null] },
          appointmentType: { $ifNull: ['$appointmentTypeRecord.name', null] },
          state: 1,
          daysFromRecommendation: 1,
        },
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                needsScheduling: {
                  $sum: { $cond: [{ $in: ['$state', ['NEEDS_SCHEDULING', 'DUE_SOON']] }, 1, 0] },
                },
                overdue: { $sum: { $cond: [{ $eq: ['$state', 'OVERDUE'] }, 1, 0] } },
                scheduled: { $sum: { $cond: [{ $eq: ['$state', 'SCHEDULED'] }, 1, 0] } },
              },
            },
          ],
          rows: [
            ...rowFilter,
            { $sort: sort },
            { $skip: pagination.skip },
            { $limit: pagination.limit },
          ],
          total: [...rowFilter, { $count: 'count' }],
        },
      },
    ]).exec();

    return result ?? { summary: [], rows: [], total: [] };
  }
}

export const followUpRepository = new FollowUpRepository();

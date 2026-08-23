import type { PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { escapeRegex } from '../../infrastructure/database/query.helpers.js';
import { TreatmentModel } from '../treatments/treatment.model.js';
import type {
  CareContinuityAggregateRow,
  CareContinuityQuery,
} from './care-continuity.types.js';

interface CareContinuityFacetResult {
  summary: Array<{ needsAttention: number; lostToFollowUp: number }>;
  rows: CareContinuityAggregateRow[];
  total: Array<{ count: number }>;
}

export class CareContinuityRepository {
  async list(
    clinicId: string,
    timezone: string,
    now: Date,
    thresholds: {
      treatmentInactivityDays: number;
      retentionInactivityDays: number;
      missedAppointmentRebookGraceDays: number;
    },
    query: CareContinuityQuery,
    pagination: PaginationParams,
  ): Promise<CareContinuityFacetResult> {
    const clinicObjectId = toObjectId(clinicId, 'clinicId');
    const activeAppointmentStatuses = ['CANCELLED', 'NO_SHOW'];
    const contextExpression = {
      $or: [
        {
          $and: [
            { $eq: ['$$careType', 'TREATMENT'] },
            { $eq: ['$treatmentId', '$$treatmentId'] },
          ],
        },
        {
          $and: [
            { $eq: ['$$careType', 'RETENTION'] },
            { $eq: ['$retentionPlanId', '$$retentionPlanId'] },
          ],
        },
      ],
    };

    const patientSearch = query.search
      ? {
          $or: [
            { 'patient.firstName': { $regex: escapeRegex(query.search), $options: 'i' } },
            { 'patient.lastName': { $regex: escapeRegex(query.search), $options: 'i' } },
            { 'patient.phone': { $regex: escapeRegex(query.search), $options: 'i' } },
          ],
        }
      : {};

    const [result] = await TreatmentModel.aggregate<CareContinuityFacetResult>([
      { $match: { clinicId: clinicObjectId, status: 'ACTIVE' } },
      {
        $project: {
          patientId: 1,
          careType: { $literal: 'TREATMENT' },
          treatmentId: '$_id',
          retentionPlanId: { $literal: null },
          careStartedAt: { $ifNull: ['$startDate', '$createdAt'] },
          initialRecommendedAt: { $literal: null },
          inactivityDays: { $literal: thresholds.treatmentInactivityDays },
        },
      },
      {
        $unionWith: {
          coll: 'retentionPlans',
          pipeline: [
            { $match: { clinicId: clinicObjectId, status: 'ACTIVE' } },
            {
              $project: {
                patientId: 1,
                careType: { $literal: 'RETENTION' },
                treatmentId: 1,
                retentionPlanId: '$_id',
                careStartedAt: { $ifNull: ['$startedAt', '$createdAt'] },
                initialRecommendedAt: '$initialControlRecommendedAt',
                inactivityDays: { $literal: thresholds.retentionInactivityDays },
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: 'clinicalVisits',
          let: {
            careType: '$careType',
            treatmentId: '$treatmentId',
            retentionPlanId: '$retentionPlanId',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$clinicId', clinicObjectId] },
                    { $eq: ['$status', 'COMPLETED'] },
                    contextExpression,
                  ],
                },
              },
            },
            { $sort: { completedAt: -1, createdAt: -1 } },
            { $limit: 1 },
            { $project: { completedAt: 1, nextVisitRecommendedAt: 1 } },
          ],
          as: 'latestVisitRecords',
        },
      },
      { $set: { latestVisit: { $first: '$latestVisitRecords' } } },
      {
        $set: {
          lastClinicalAt: { $ifNull: ['$latestVisit.completedAt', '$careStartedAt'] },
          recommendedAt: {
            $cond: [
              { $ne: [{ $ifNull: ['$latestVisit._id', null] }, null] },
              { $ifNull: ['$latestVisit.nextVisitRecommendedAt', null] },
              { $ifNull: ['$initialRecommendedAt', null] },
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'appointments',
          let: {
            careType: '$careType',
            treatmentId: '$treatmentId',
            retentionPlanId: '$retentionPlanId',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$clinicId', clinicObjectId] },
                    { $gte: ['$startAt', now] },
                    { $not: { $in: ['$status', activeAppointmentStatuses] } },
                    contextExpression,
                  ],
                },
              },
            },
            { $sort: { startAt: 1 } },
            { $limit: 1 },
            { $project: { _id: 1 } },
          ],
          as: 'futureAppointments',
        },
      },
      { $match: { 'futureAppointments.0': { $exists: false } } },
      {
        $lookup: {
          from: 'appointments',
          let: {
            careType: '$careType',
            treatmentId: '$treatmentId',
            retentionPlanId: '$retentionPlanId',
            lastClinicalAt: '$lastClinicalAt',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$clinicId', clinicObjectId] },
                    { $gte: ['$startAt', '$$lastClinicalAt'] },
                    { $lt: ['$startAt', now] },
                    { $in: ['$status', activeAppointmentStatuses] },
                    contextExpression,
                  ],
                },
              },
            },
            { $sort: { startAt: -1 } },
            { $limit: 1 },
            { $project: { _id: 1, startAt: 1, status: 1 } },
          ],
          as: 'missedAppointmentRecords',
        },
      },
      { $set: { missedAppointment: { $first: '$missedAppointmentRecords' } } },
      {
        $set: {
          daysWithoutVisit: {
            $dateDiff: {
              startDate: { $dateTrunc: { date: '$lastClinicalAt', unit: 'day', timezone } },
              endDate: { $dateTrunc: { date: now, unit: 'day', timezone } },
              unit: 'day',
              timezone,
            },
          },
          missedDays: {
            $cond: [
              { $ne: [{ $ifNull: ['$missedAppointment._id', null] }, null] },
              {
                $dateDiff: {
                  startDate: {
                    $dateTrunc: { date: '$missedAppointment.startAt', unit: 'day', timezone },
                  },
                  endDate: { $dateTrunc: { date: now, unit: 'day', timezone } },
                  unit: 'day',
                  timezone,
                },
              },
              -1,
            ],
          },
        },
      },
      {
        $set: {
          isInactive: { $gte: ['$daysWithoutVisit', '$inactivityDays'] },
          isRecommendationOverdue: {
            $and: [
              { $ne: [{ $ifNull: ['$recommendedAt', null] }, null] },
              { $lt: ['$recommendedAt', now] },
            ],
          },
          isMissedNotRebooked: {
            $gte: ['$missedDays', thresholds.missedAppointmentRebookGraceDays],
          },
        },
      },
      {
        $match: {
          $expr: {
            $or: ['$isInactive', '$isRecommendationOverdue', '$isMissedNotRebooked'],
          },
        },
      },
      {
        $set: {
          state: { $cond: ['$isInactive', 'LOST_TO_FOLLOW_UP', 'NEEDS_ATTENTION'] },
          severity: { $cond: ['$isInactive', 2, 1] },
          reasons: {
            $concatArrays: [
              { $cond: ['$isInactive', ['NO_RECENT_VISIT'], []] },
              ['NO_FUTURE_APPOINTMENT'],
              {
                $cond: [
                  '$isRecommendationOverdue',
                  ['RETENTION_CONTROL_OVERDUE'],
                  [],
                ],
              },
              { $cond: ['$isMissedNotRebooked', ['MISSED_NOT_REBOOKED'], []] },
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'patients',
          let: { patientId: '$patientId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$patientId'] },
                    { $eq: ['$clinicId', clinicObjectId] },
                    { $eq: ['$status', 'ACTIVE'] },
                  ],
                },
              },
            },
            { $project: { firstName: 1, lastName: 1, phone: 1 } },
          ],
          as: 'patientRecords',
        },
      },
      { $set: { patient: { $first: '$patientRecords' } } },
      { $match: { patient: { $ne: null }, ...patientSearch } },
      {
        $lookup: {
          from: 'treatments',
          let: { treatmentId: '$treatmentId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$treatmentId'] },
                    { $eq: ['$clinicId', clinicObjectId] },
                  ],
                },
              },
            },
            { $project: { type: 1, customTypeLabel: 1 } },
          ],
          as: 'treatmentRecords',
        },
      },
      { $set: { treatment: { $first: '$treatmentRecords' } } },
      { $sort: { severity: -1, daysWithoutVisit: -1, patientId: 1 } },
      { $group: { _id: '$patientId', row: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$row' } },
      {
        $project: {
          patientId: 1,
          patientFirstName: '$patient.firstName',
          patientLastName: '$patient.lastName',
          patientPhone: { $ifNull: ['$patient.phone', null] },
          careType: 1,
          treatmentId: 1,
          retentionPlanId: { $ifNull: ['$retentionPlanId', null] },
          treatmentType: '$treatment.type',
          treatmentCustomLabel: { $ifNull: ['$treatment.customTypeLabel', null] },
          state: 1,
          reasons: 1,
          lastClinicalAt: 1,
          daysWithoutVisit: 1,
          recommendedAt: { $ifNull: ['$recommendedAt', null] },
          missedAppointmentId: { $ifNull: ['$missedAppointment._id', null] },
          missedAppointmentAt: { $ifNull: ['$missedAppointment.startAt', null] },
          missedAppointmentStatus: { $ifNull: ['$missedAppointment.status', null] },
        },
      },
      ...(query.state ? [{ $match: { state: query.state } }] : []),
      { $sort: { state: 1, daysWithoutVisit: -1, patientLastName: 1, patientId: 1 } },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                needsAttention: {
                  $sum: { $cond: [{ $eq: ['$state', 'NEEDS_ATTENTION'] }, 1, 0] },
                },
                lostToFollowUp: {
                  $sum: { $cond: [{ $eq: ['$state', 'LOST_TO_FOLLOW_UP'] }, 1, 0] },
                },
              },
            },
          ],
          rows: [{ $skip: pagination.skip }, { $limit: pagination.limit }],
          total: [{ $count: 'count' }],
        },
      },
    ]).exec();

    return result ?? { summary: [], rows: [], total: [] };
  }
}

export const careContinuityRepository = new CareContinuityRepository();

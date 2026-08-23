import type { PipelineStage } from 'mongoose';
import { toObjectId } from '../../common/utils/object-id.js';
import { AppointmentModel } from '../appointments/appointment.model.js';
import { AuditLogModel } from '../audit-logs/audit-log.model.js';
import { AUDIT_ACTIONS } from '../audit-logs/audit-log.types.js';
import { ClinicalVisitModel } from '../clinical-visits/clinical-visit.model.js';
import { PatientModel } from '../patients/patient.model.js';
import { RetainerDeviceModel, RetentionPlanModel } from '../retention/retention.model.js';
import { TreatmentModel } from '../treatments/treatment.model.js';
import type { ReportBucket } from './reports.types.js';

export interface ReportRange {
  from: Date;
  to: Date;
  bucket: ReportBucket;
  timezone: string;
}

export interface AppointmentAggregateSummary {
  booked: number;
  eligible: number;
  completed: number;
  cancelled: number;
  noShow: number;
  attended: number;
}

export interface AppointmentAggregatePoint extends AppointmentAggregateSummary {
  bucket: Date;
}

export interface AppointmentAggregateResult {
  summary: AppointmentAggregateSummary;
  series: AppointmentAggregatePoint[];
}

export interface ClinicalAggregateResult {
  completed: number;
  uniquePatients: number;
  newPatients: number;
}

export interface TreatmentAggregateResult {
  activeNow: number;
  pausedNow: number;
  started: number;
  completed: number;
  cancelled: number;
  startedSeries: Array<{ bucket: Date; value: number }>;
  completedSeries: Array<{ bucket: Date; value: number }>;
}

export interface RetentionAggregateResult {
  activePlansNow: number;
  activeDevicesNow: number;
  started: number;
  completed: number;
  replacements: number;
}

function bucketExpression(field: string, range: ReportRange): Record<string, unknown> {
  return {
    $dateTrunc: {
      date: field,
      unit: range.bucket,
      timezone: range.timezone,
      ...(range.bucket === 'week' ? { startOfWeek: 'monday' } : {}),
    },
  };
}

function zeroAppointmentSummary(): AppointmentAggregateSummary {
  return { booked: 0, eligible: 0, completed: 0, cancelled: 0, noShow: 0, attended: 0 };
}

export class ReportsRepository {
  async appointmentMetrics(clinicId: string, range: ReportRange): Promise<AppointmentAggregateResult> {
    const clinicObjectId = toObjectId(clinicId, 'clinicId');
    const [result] = await AppointmentModel.aggregate<{
      summary: AppointmentAggregateSummary[];
      series: AppointmentAggregatePoint[];
    }>([
      {
        $match: {
          clinicId: clinicObjectId,
          startAt: { $gte: range.from, $lt: range.to },
        },
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                booked: { $sum: 1 },
                eligible: { $sum: { $cond: [{ $ne: ['$status', 'CANCELLED'] }, 1, 0] } },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
                cancelled: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } },
                noShow: { $sum: { $cond: [{ $eq: ['$status', 'NO_SHOW'] }, 1, 0] } },
                attended: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$status', 'CANCELLED'] },
                          { $ne: [{ $ifNull: ['$arrivedAt', null] }, null] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
            { $project: { _id: 0 } },
          ],
          series: [
            {
              $group: {
                _id: bucketExpression('$startAt', range),
                booked: { $sum: 1 },
                eligible: { $sum: { $cond: [{ $ne: ['$status', 'CANCELLED'] }, 1, 0] } },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
                cancelled: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } },
                noShow: { $sum: { $cond: [{ $eq: ['$status', 'NO_SHOW'] }, 1, 0] } },
                attended: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$status', 'CANCELLED'] },
                          { $ne: [{ $ifNull: ['$arrivedAt', null] }, null] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, bucket: '$_id', booked: 1, eligible: 1, completed: 1, cancelled: 1, noShow: 1, attended: 1 } },
          ],
        },
      },
    ] as PipelineStage[]).exec();

    return { summary: result?.summary[0] ?? zeroAppointmentSummary(), series: result?.series ?? [] };
  }

  async clinicalMetrics(clinicId: string, range: Pick<ReportRange, 'from' | 'to'>): Promise<ClinicalAggregateResult> {
    const clinicObjectId = toObjectId(clinicId, 'clinicId');
    const [visits, newPatients] = await Promise.all([
      ClinicalVisitModel.aggregate<{ completed: number; uniquePatients: number }>([
        {
          $match: {
            clinicId: clinicObjectId,
            status: 'COMPLETED',
            completedAt: { $gte: range.from, $lt: range.to },
          },
        },
        { $group: { _id: '$patientId', visits: { $sum: 1 } } },
        { $group: { _id: null, completed: { $sum: '$visits' }, uniquePatients: { $sum: 1 } } },
        { $project: { _id: 0 } },
      ]).exec(),
      PatientModel.countDocuments({
        clinicId: clinicObjectId,
        createdAt: { $gte: range.from, $lt: range.to },
      }).exec(),
    ]);
    return {
      completed: visits[0]?.completed ?? 0,
      uniquePatients: visits[0]?.uniquePatients ?? 0,
      newPatients,
    };
  }

  async treatmentMetrics(
    clinicId: string,
    range: ReportRange,
    dateRange: { from: Date; to: Date },
    includeSnapshot: boolean,
  ): Promise<TreatmentAggregateResult> {
    const clinicObjectId = toObjectId(clinicId, 'clinicId');
    const [results, cancellations] = await Promise.all([
      TreatmentModel.aggregate<{
        snapshot: Array<{ activeNow: number; pausedNow: number }>;
        started: Array<{ value: number }>;
        completed: Array<{ value: number }>;
        startedSeries: Array<{ bucket: Date; value: number }>;
        completedSeries: Array<{ bucket: Date; value: number }>;
      }>([
        { $match: { clinicId: clinicObjectId } },
        {
          $facet: {
            snapshot: includeSnapshot
              ? [
                  {
                    $group: {
                      _id: null,
                      activeNow: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
                      pausedNow: { $sum: { $cond: [{ $eq: ['$status', 'PAUSED'] }, 1, 0] } },
                    },
                  },
                ]
              : [],
            started: [
              { $match: { startDate: { $gte: dateRange.from, $lt: dateRange.to } } },
              { $count: 'value' },
            ],
            completed: [
              { $match: { completedAt: { $gte: range.from, $lt: range.to } } },
              { $count: 'value' },
            ],
            startedSeries: [
              { $match: { startDate: { $gte: dateRange.from, $lt: dateRange.to } } },
              {
                $group: {
                  _id: bucketExpression('$startDate', { ...range, timezone: 'UTC' }),
                  value: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
              { $project: { _id: 0, bucket: '$_id', value: 1 } },
            ],
            completedSeries: [
              { $match: { completedAt: { $gte: range.from, $lt: range.to } } },
              { $group: { _id: bucketExpression('$completedAt', range), value: { $sum: 1 } } },
              { $sort: { _id: 1 } },
              { $project: { _id: 0, bucket: '$_id', value: 1 } },
            ],
          },
        },
      ] as PipelineStage[]).exec(),
      AuditLogModel.countDocuments({
        clinicId: clinicObjectId,
        action: AUDIT_ACTIONS.TREATMENT_CANCELLED,
        createdAt: { $gte: range.from, $lt: range.to },
      }).exec(),
    ]);

    const result = results[0];
    return {
      activeNow: result?.snapshot[0]?.activeNow ?? 0,
      pausedNow: result?.snapshot[0]?.pausedNow ?? 0,
      started: result?.started[0]?.value ?? 0,
      completed: result?.completed[0]?.value ?? 0,
      cancelled: cancellations,
      startedSeries: result?.startedSeries ?? [],
      completedSeries: result?.completedSeries ?? [],
    };
  }

  async retentionMetrics(
    clinicId: string,
    range: Pick<ReportRange, 'from' | 'to'>,
    includeSnapshot: boolean,
  ): Promise<RetentionAggregateResult> {
    const clinicObjectId = toObjectId(clinicId, 'clinicId');
    const [plans, devices] = await Promise.all([
      RetentionPlanModel.aggregate<{
        snapshot: Array<{ activePlansNow: number }>;
        started: Array<{ value: number }>;
        completed: Array<{ value: number }>;
      }>([
        { $match: { clinicId: clinicObjectId } },
        {
          $facet: {
            snapshot: includeSnapshot
              ? [
                  { $match: { status: 'ACTIVE' } },
                  { $count: 'activePlansNow' },
                ]
              : [],
            started: [
              { $match: { startedAt: { $gte: range.from, $lt: range.to } } },
              { $count: 'value' },
            ],
            completed: [
              { $match: { completedAt: { $gte: range.from, $lt: range.to } } },
              { $count: 'value' },
            ],
          },
        },
      ]).exec(),
      RetainerDeviceModel.aggregate<{
        snapshot: Array<{ activeDevicesNow: number }>;
        replacements: Array<{ value: number }>;
      }>([
        { $match: { clinicId: clinicObjectId } },
        {
          $facet: {
            snapshot: includeSnapshot
              ? [{ $match: { status: 'ACTIVE' } }, { $count: 'activeDevicesNow' }]
              : [],
            replacements: [
              {
                $match: {
                  deliveredAt: { $gte: range.from, $lt: range.to },
                  replacesRetainerId: { $ne: null },
                },
              },
              { $count: 'value' },
            ],
          },
        },
      ]).exec(),
    ]);

    return {
      activePlansNow: plans[0]?.snapshot[0]?.activePlansNow ?? 0,
      activeDevicesNow: devices[0]?.snapshot[0]?.activeDevicesNow ?? 0,
      started: plans[0]?.started[0]?.value ?? 0,
      completed: plans[0]?.completed[0]?.value ?? 0,
      replacements: devices[0]?.replacements[0]?.value ?? 0,
    };
  }
}

export const reportsRepository = new ReportsRepository();

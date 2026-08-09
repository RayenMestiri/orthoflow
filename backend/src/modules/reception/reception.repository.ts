import type { Types } from 'mongoose';
import { toObjectId } from '../../common/utils/object-id.js';
import { AppointmentModel } from '../appointments/appointment.model.js';
import type { AppointmentStatus } from '../appointments/appointment.types.js';

/** One appointment with the names reception needs, resolved in the database. */
export interface ReceptionAggregate {
  _id: Types.ObjectId;
  patientId: Types.ObjectId;
  patientFirstName: string;
  patientLastName: string;
  appointmentTypeName: string;
  treatmentType: string | null;
  treatmentCustomLabel: string | null;

  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  status: AppointmentStatus;

  arrivedAt: Date | null;
  treatmentStartedAt: Date | null;
  completedAt: Date | null;
  noShowAt: Date | null;

  note: string | null;
  cancellationReason: string | null;
}

/**
 * The reception day query.
 *
 * ONE ROUND TRIP, BY DESIGN. The naive version fetches the day's appointments
 * and then looks up a patient and an appointment type per row — twenty
 * appointments become forty-one queries, every thirty seconds, all day. The
 * joins happen in the database instead, behind the existing
 * `(clinicId, startAt)` index that the schedule already relies on.
 *
 * TENANCY: `clinicId` is the first `$match`, as everywhere else.
 */
export class ReceptionRepository {
  async listDay(clinicId: string, start: Date, end: Date): Promise<ReceptionAggregate[]> {
    return AppointmentModel.aggregate<ReceptionAggregate>([
      {
        $match: {
          clinicId: toObjectId(clinicId, 'clinicId'),
          startAt: { $gte: start, $lt: end },
        },
      },
      { $sort: { startAt: 1 } },
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
        $lookup: {
          from: 'appointmentTypes',
          localField: 'appointmentTypeId',
          foreignField: '_id',
          as: 'appointmentType',
        },
      },
      { $unwind: { path: '$appointmentType', preserveNullAndEmptyArrays: true } },
      {
        /**
         * The patient's current course of care, for row context only.
         *
         * Read-only across the boundary: reception never writes to Treatment.
         * Limited to one because a patient has at most one live course, and the
         * row shows a label rather than a list.
         */
        $lookup: {
          from: 'treatments',
          let: { patientId: '$patientId', clinicId: '$clinicId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$clinicId', '$$clinicId'] },
                    { $eq: ['$patientId', '$$patientId'] },
                    { $in: ['$status', ['ACTIVE', 'PAUSED']] },
                  ],
                },
              },
            },
            { $sort: { startDate: -1 } },
            { $limit: 1 },
            { $project: { type: 1, customTypeLabel: 1 } },
          ],
          as: 'treatment',
        },
      },
      {
        $project: {
          patientId: 1,
          patientFirstName: { $ifNull: ['$patient.firstName', ''] },
          patientLastName: { $ifNull: ['$patient.lastName', ''] },
          appointmentTypeName: { $ifNull: ['$appointmentType.name', 'Appointment'] },
          treatmentType: { $ifNull: [{ $first: '$treatment.type' }, null] },
          treatmentCustomLabel: { $ifNull: [{ $first: '$treatment.customTypeLabel' }, null] },
          startAt: 1,
          endAt: 1,
          durationMinutes: 1,
          status: 1,
          arrivedAt: 1,
          treatmentStartedAt: 1,
          completedAt: 1,
          noShowAt: 1,
          note: 1,
          cancellationReason: 1,
        },
      },
    ]).exec();
  }
}

export const receptionRepository = new ReceptionRepository();

import type { ClientSession, QueryFilter } from 'mongoose';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { CommunicationJobModel } from './communication.model.js';
import {
  COMMUNICATION_JOB_STATUSES,
  type CommunicationJobRecord,
  type CommunicationJobStatus,
  type CreateCommunicationJobInput,
} from './communication.types.js';

const optionalObjectId = (value: string | null | undefined, field: string) =>
  value ? toObjectId(value, field) : null;

export class CommunicationRepository {
  async cancelExpired(now: Date): Promise<number> {
    const result = await CommunicationJobModel.updateMany(
      {
        status: {
          $in: [COMMUNICATION_JOB_STATUSES.PENDING, COMMUNICATION_JOB_STATUSES.PROCESSING],
        },
        expiresAt: { $lte: now },
      },
      {
        $set: {
          status: COMMUNICATION_JOB_STATUSES.CANCELLED,
          cancelledAt: now,
          cancellationReason: 'EXPIRED',
          claimedAt: null,
          claimedUntil: null,
          claimedBy: null,
        },
      },
    ).exec();
    return result.modifiedCount;
  }

  async createIdempotent(
    input: CreateCommunicationJobInput,
    session?: ClientSession,
  ): Promise<void> {
    await CommunicationJobModel.updateOne(
      {
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        deduplicationKey: input.deduplicationKey,
      },
      {
        $setOnInsert: {
          sourceEventId: input.sourceEventId,
          eventType: input.eventType,
          patientId: optionalObjectId(input.patientId, 'patientId'),
          appointmentId: optionalObjectId(input.appointmentId, 'appointmentId'),
          recipientType: input.recipientType,
          recipientId: toObjectId(input.recipientId, 'recipientId'),
          channel: input.channel,
          destinationSnapshot: input.destinationSnapshot,
          destinationMasked: input.destinationMasked,
          templateKey: input.templateKey,
          templateVersion: input.templateVersion,
          locale: input.locale,
          payloadSnapshot: input.payloadSnapshot,
          status: COMMUNICATION_JOB_STATUSES.PENDING,
          scheduledFor: input.scheduledFor,
          expiresAt: input.expiresAt,
          sentAt: null,
          attemptCount: 0,
          lastErrorCode: null,
          lastErrorAt: null,
          providerMessageId: null,
          claimedAt: null,
          claimedUntil: null,
          claimedBy: null,
          retryOfJobId: optionalObjectId(input.retryOfJobId, 'retryOfJobId'),
          cancelledAt: null,
          cancellationReason: null,
        },
      },
      { upsert: true, runValidators: true, session },
    ).exec();
  }

  async claimNext(
    workerId: string,
    now: Date,
    leaseMs: number,
  ): Promise<CommunicationJobRecord | null> {
    return CommunicationJobModel.findOneAndUpdate(
      {
        status: {
          $in: [COMMUNICATION_JOB_STATUSES.PENDING, COMMUNICATION_JOB_STATUSES.PROCESSING],
        },
        scheduledFor: { $lte: now },
        expiresAt: { $gt: now },
        $or: [{ claimedUntil: null }, { claimedUntil: { $lte: now } }],
      },
      {
        $set: {
          status: COMMUNICATION_JOB_STATUSES.PROCESSING,
          claimedAt: now,
          claimedUntil: new Date(now.getTime() + leaseMs),
          claimedBy: workerId,
        },
        $inc: { attemptCount: 1 },
      },
      { new: true, sort: { scheduledFor: 1, createdAt: 1 } },
    )
      .lean<CommunicationJobRecord | null>()
      .exec();
  }

  async markSent(
    id: string,
    workerId: string,
    providerMessageId: string | null,
    at: Date,
  ): Promise<void> {
    await CommunicationJobModel.updateOne(
      {
        _id: toObjectId(id, 'jobId'),
        claimedBy: workerId,
        status: COMMUNICATION_JOB_STATUSES.PROCESSING,
      },
      {
        $set: {
          status: COMMUNICATION_JOB_STATUSES.SENT,
          sentAt: at,
          providerMessageId,
          claimedAt: null,
          claimedUntil: null,
          claimedBy: null,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      },
    ).exec();
  }

  async markDeliveryFailure(
    id: string,
    workerId: string,
    errorCode: string,
    permanent: boolean,
    attemptCount: number,
    at: Date,
  ): Promise<void> {
    const delays = [60_000, 300_000, 900_000, 3_600_000, 21_600_000];
    const terminal = permanent || attemptCount >= delays.length;
    const next = new Date(at.getTime() + (delays[Math.max(attemptCount - 1, 0)] ?? delays.at(-1)!));
    await CommunicationJobModel.updateOne(
      {
        _id: toObjectId(id, 'jobId'),
        claimedBy: workerId,
        status: COMMUNICATION_JOB_STATUSES.PROCESSING,
      },
      {
        $set: {
          status: terminal ? COMMUNICATION_JOB_STATUSES.FAILED : COMMUNICATION_JOB_STATUSES.PENDING,
          scheduledFor: next,
          lastErrorCode: errorCode.slice(0, 120),
          lastErrorAt: at,
          claimedAt: null,
          claimedUntil: null,
          claimedBy: null,
        },
      },
    ).exec();
  }

  async cancelPendingForAppointment(
    clinicId: string,
    appointmentId: string,
    reason: string,
    session?: ClientSession,
  ): Promise<number> {
    const query = CommunicationJobModel.updateMany(
      {
        clinicId: toObjectId(clinicId, 'clinicId'),
        appointmentId: toObjectId(appointmentId, 'appointmentId'),
        templateKey: 'APPOINTMENT_REMINDER',
        status: {
          $in: [COMMUNICATION_JOB_STATUSES.PENDING, COMMUNICATION_JOB_STATUSES.PROCESSING],
        },
      },
      {
        $set: {
          status: COMMUNICATION_JOB_STATUSES.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason,
          claimedAt: null,
          claimedUntil: null,
          claimedBy: null,
        },
      },
    );
    if (session) query.session(session);
    const result = await query.exec();
    return result.modifiedCount;
  }

  async findByIdInClinic(id: string, clinicId: string): Promise<CommunicationJobRecord | null> {
    return CommunicationJobModel.findOne({
      _id: toObjectId(id, 'jobId'),
      clinicId: toObjectId(clinicId, 'clinicId'),
    })
      .lean<CommunicationJobRecord | null>()
      .exec();
  }

  async hasRecentRetry(jobId: string, clinicId: string, since: Date): Promise<boolean> {
    return Boolean(
      await CommunicationJobModel.exists({
        clinicId: toObjectId(clinicId, 'clinicId'),
        retryOfJobId: toObjectId(jobId, 'jobId'),
        createdAt: { $gte: since },
      }).exec(),
    );
  }

  async list(
    clinicId: string,
    filters: { patientId?: string; status?: CommunicationJobStatus },
    page: PaginationParams,
  ): Promise<PaginatedResult<CommunicationJobRecord>> {
    const query: QueryFilter<CommunicationJobRecord> = {
      clinicId: toObjectId(clinicId, 'clinicId'),
    };
    if (filters.patientId) query.patientId = toObjectId(filters.patientId, 'patientId');
    if (filters.status) query.status = filters.status;
    const [items, total] = await Promise.all([
      CommunicationJobModel.find(query)
        .sort({ createdAt: -1 })
        .skip(page.skip)
        .limit(page.limit)
        .lean<CommunicationJobRecord[]>()
        .exec(),
      CommunicationJobModel.countDocuments(query).exec(),
    ]);
    return { items, total };
  }
}

export const communicationRepository = new CommunicationRepository();

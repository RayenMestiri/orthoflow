import { ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import type { MutationContext } from '../../common/utils/request-context.js';
import { toPaginationParams } from '../../common/utils/pagination.js';
import { auditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import {
  communicationRepository,
  type CommunicationRepository,
} from './communication.repository.js';
import { channelAdapterRegistry } from './channel-adapters.js';
import {
  COMMUNICATION_JOB_STATUSES,
  type CommunicationJobDto,
  type CommunicationJobRecord,
  type CommunicationJobStatus,
} from './communication.types.js';

export const toCommunicationJobDto = (record: CommunicationJobRecord): CommunicationJobDto => ({
  id: record._id.toString(),
  eventType: record.eventType,
  patientId: record.patientId?.toString() ?? null,
  appointmentId: record.appointmentId?.toString() ?? null,
  recipientType: record.recipientType,
  recipientId: record.recipientId.toString(),
  channel: record.channel,
  destinationMasked: record.destinationMasked,
  templateKey: record.templateKey,
  status: record.status,
  scheduledFor: record.scheduledFor.toISOString(),
  sentAt: record.sentAt?.toISOString() ?? null,
  attemptCount: record.attemptCount,
  lastErrorCode: record.lastErrorCode,
  retryOfJobId: record.retryOfJobId?.toString() ?? null,
  createdAt: record.createdAt.toISOString(),
});

export class CommunicationService {
  constructor(private readonly jobs: CommunicationRepository = communicationRepository) {}

  async list(
    clinicId: string,
    filters: { patientId?: string; status?: CommunicationJobStatus },
    page: { page?: number; limit?: number },
  ) {
    const pagination = toPaginationParams(page);
    const result = await this.jobs.list(clinicId, filters, pagination);
    return {
      result: { items: result.items.map(toCommunicationJobDto), total: result.total },
      pagination,
    };
  }

  providerStatus() {
    return channelAdapterRegistry.status();
  }

  async retry(clinicId: string, jobId: string, context: MutationContext): Promise<void> {
    const job = await this.jobs.findByIdInClinic(jobId, clinicId);
    if (!job) throw new NotFoundError('Communication job not found');
    if (job.status !== COMMUNICATION_JOB_STATUSES.FAILED) {
      throw new ConflictError('Only failed communication can be retried');
    }
    const now = new Date();
    if (await this.jobs.hasRecentRetry(jobId, clinicId, new Date(now.getTime() - 60_000))) {
      throw new ConflictError('This communication was retried recently');
    }
    await this.jobs.createIdempotent({
      clinicId,
      sourceEventId: job.sourceEventId,
      eventType: job.eventType,
      patientId: job.patientId?.toString() ?? null,
      appointmentId: job.appointmentId?.toString() ?? null,
      recipientType: job.recipientType,
      recipientId: job.recipientId.toString(),
      channel: job.channel,
      destinationSnapshot: job.destinationSnapshot,
      destinationMasked: job.destinationMasked,
      templateKey: job.templateKey,
      templateVersion: job.templateVersion,
      locale: job.locale,
      payloadSnapshot: job.payloadSnapshot,
      deduplicationKey: `MANUAL_RETRY:${jobId}:${now.toISOString()}`,
      scheduledFor: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      retryOfJobId: jobId,
    });
    await auditLogService.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.COMMUNICATION_RETRY_REQUESTED,
      resourceType: AUDIT_RESOURCE_TYPES.COMMUNICATION_JOB,
      resourceId: jobId,
      metadata: { channel: job.channel, eventType: job.eventType },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}

export const communicationService = new CommunicationService();

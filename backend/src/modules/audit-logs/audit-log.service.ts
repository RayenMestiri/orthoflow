import type { ClientSession } from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import { logger as baseLogger } from '../../config/logger.js';
import { toPaginationParams } from '../../common/utils/pagination.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { auditLogRepository, type AuditLogRepository } from './audit-log.repository.js';
import type {
  AuditLogDto,
  AuditLogListFilters,
  AuditLogRecord,
  RecordAuditEventInput,
} from './audit-log.types.js';

export function toAuditLogDto(record: AuditLogRecord): AuditLogDto {
  return {
    id: record._id.toString(),
    clinicId: record.clinicId?.toString() ?? null,
    actorUserId: record.actorUserId?.toString() ?? null,
    actorPortalUserId: record.actorPortalUserId?.toString() ?? null,
    actorKind: record.actorKind ?? (record.actorUserId ? 'STAFF' : 'SYSTEM'),
    action: record.action,
    resourceType: record.resourceType,
    resourceId: record.resourceId?.toString() ?? null,
    metadata: record.metadata ?? {},
    createdAt: record.createdAt.toISOString(),
  };
}

export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository = auditLogRepository) {}

  /**
   * Writes an audit entry and propagates failures.
   *
   * Use inside the same transaction as the change being audited whenever the
   * change is financially or legally meaningful: a cash record that exists with
   * no trace of who entered it is exactly the dispute OrthoFlow must prevent.
   */
  async record(input: RecordAuditEventInput, session?: ClientSession): Promise<void> {
    await this.repository.create(input, session);
  }

  /**
   * Best-effort variant for peripheral events (logins, logouts).
   *
   * A logging hiccup must not turn a successful sign-in into a 500, so the
   * failure is logged loudly and swallowed.
   */
  async recordSafe(
    input: RecordAuditEventInput,
    log: FastifyBaseLogger = baseLogger,
  ): Promise<void> {
    try {
      await this.repository.create(input);
    } catch (error) {
      log.error({ err: error, action: input.action }, 'Failed to write audit log entry');
    }
  }

  async listForClinic(
    clinicId: string,
    filters: AuditLogListFilters,
    page: { page?: number; limit?: number },
  ): Promise<{ result: PaginatedResult<AuditLogDto>; pagination: PaginationParams }> {
    const pagination = toPaginationParams(page);
    const { items, total } = await this.repository.listByClinic(clinicId, filters, pagination);
    return { result: { items: items.map(toAuditLogDto), total }, pagination };
  }
}

export const auditLogService = new AuditLogService();

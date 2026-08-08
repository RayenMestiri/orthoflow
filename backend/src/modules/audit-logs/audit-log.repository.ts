import type { ClientSession, QueryFilter } from 'mongoose';
import { toObjectId } from '../../common/utils/object-id.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { AuditLogModel } from './audit-log.model.js';
import type {
  AuditLogAttributes,
  AuditLogListFilters,
  AuditLogRecord,
  RecordAuditEventInput,
} from './audit-log.types.js';

export class AuditLogRepository {
  async create(input: RecordAuditEventInput, session?: ClientSession): Promise<AuditLogRecord> {
    const [created] = await AuditLogModel.create(
      [
        {
          clinicId: input.clinicId ? toObjectId(input.clinicId, 'clinicId') : null,
          actorUserId: input.actorUserId ? toObjectId(input.actorUserId, 'actorUserId') : null,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ? toObjectId(input.resourceId, 'resourceId') : null,
          metadata: input.metadata ?? {},
          ip: input.ip ?? null,
          userAgent: input.userAgent?.slice(0, 256) ?? null,
        },
      ],
      { session, ordered: true },
    );

    if (!created) {
      throw new Error('Audit log creation returned no document');
    }

    return created.toObject<AuditLogRecord>();
  }

  /** Always clinic-scoped — there is no cross-tenant audit query. */
  async listByClinic(
    clinicId: string,
    filters: AuditLogListFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<AuditLogRecord>> {
    const filter: QueryFilter<AuditLogAttributes> = {
      clinicId: toObjectId(clinicId, 'clinicId'),
    };

    if (filters.action !== undefined) {
      filter.action = filters.action;
    }
    if (filters.resourceType !== undefined) {
      filter.resourceType = filters.resourceType;
    }
    if (filters.resourceId !== undefined) {
      filter.resourceId = toObjectId(filters.resourceId, 'resourceId');
    }
    if (filters.actorUserId !== undefined) {
      filter.actorUserId = toObjectId(filters.actorUserId, 'actorUserId');
    }
    if (filters.from !== undefined || filters.to !== undefined) {
      filter.createdAt = {
        ...(filters.from === undefined ? {} : { $gte: filters.from }),
        ...(filters.to === undefined ? {} : { $lte: filters.to }),
      };
    }

    const [items, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<AuditLogRecord[]>()
        .exec(),
      AuditLogModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }
}

export const auditLogRepository = new AuditLogRepository();

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, paginatedSchema } from '../../common/validation/api-schemas.js';
import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQuerySchema,
} from '../../common/validation/common.schemas.js';
import { requireTenant } from '../../common/utils/request-context.js';
import { paginated } from '../../common/utils/response.js';
import { auditLogService } from './audit-log.service.js';
import { AUDIT_ACTION_VALUES, AUDIT_RESOURCE_TYPE_VALUES } from './audit-log.types.js';

const auditLogDtoSchema = z.object({
  id: objectIdSchema,
  clinicId: objectIdSchema.nullable(),
  actorUserId: objectIdSchema.nullable(),
  actorPortalUserId: objectIdSchema.nullable(),
  actorKind: z.enum(['STAFF', 'PORTAL', 'SYSTEM']),
  action: z.enum(AUDIT_ACTION_VALUES),
  resourceType: z.enum(AUDIT_RESOURCE_TYPE_VALUES),
  resourceId: objectIdSchema.nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

const auditLogQuerySchema = paginationQuerySchema.extend({
  action: z.enum(AUDIT_ACTION_VALUES).optional(),
  resourceType: z.enum(AUDIT_RESOURCE_TYPE_VALUES).optional(),
  actorUserId: objectIdSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});

/**
 * Mounted at `/api/v1/audit-logs`.
 *
 * Read-only on purpose: there is no create, update or delete endpoint anywhere
 * for audit entries. They are written by services as a side effect of the change
 * they describe, and only a clinic owner may read them.
 */
export const auditLogRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.AUDIT_LOG_READ)],
      schema: {
        tags: ['audit-logs'],
        summary: 'Read the clinic audit trail',
        security: [{ bearerAuth: [] }],
        querystring: auditLogQuerySchema,
        response: {
          200: paginatedSchema(auditLogDtoSchema),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    async (request, reply) => {
      const { page, limit, action, resourceType, actorUserId, from, to } = request.query;

      const { result, pagination } = await auditLogService.listForClinic(
        requireTenant(request).clinicId,
        {
          ...(action ? { action } : {}),
          ...(resourceType ? { resourceType } : {}),
          ...(actorUserId ? { actorUserId } : {}),
          ...(from ? { from: new Date(from) } : {}),
          ...(to ? { to: new Date(to) } : {}),
        },
        { page, limit },
      );

      return reply.send(paginated(result, pagination));
    },
  );
};

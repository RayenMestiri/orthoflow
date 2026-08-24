import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  errorResponses,
  paginatedSchema,
  successSchema,
} from '../../common/validation/api-schemas.js';
import { objectIdSchema, paginationQuerySchema } from '../../common/validation/common.schemas.js';
import { requireAuthUser, requireTenant } from '../../common/utils/request-context.js';
import { paginated } from '../../common/utils/response.js';
import { notificationService } from './notification.service.js';
import {
  NOTIFICATION_PRIORITY_VALUES,
  NOTIFICATION_TARGET_VALUES,
  NOTIFICATION_TYPE_VALUES,
} from './notification.types.js';

const contextSchema = z.object({
  target: z.enum(NOTIFICATION_TARGET_VALUES),
  patientId: objectIdSchema.nullable(),
  taskId: objectIdSchema.nullable(),
  appointmentId: objectIdSchema.nullable(),
  consentId: objectIdSchema.nullable(),
  documentId: objectIdSchema.nullable(),
  treatmentId: objectIdSchema.nullable(),
  retentionPlanId: objectIdSchema.nullable(),
});

const notificationDtoSchema = z.object({
  id: objectIdSchema,
  type: z.enum(NOTIFICATION_TYPE_VALUES),
  priority: z.enum(NOTIFICATION_PRIORITY_VALUES),
  title: z.string(),
  message: z.string(),
  context: contextSchema,
  occurredAt: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

const listQuerySchema = paginationQuerySchema.extend({
  filter: z.enum(['ALL', 'UNREAD']).default('ALL'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  const canRead = app.requirePermission(PERMISSIONS.NOTIFICATION_READ);

  app.get(
    '/',
    {
      preHandler: [canRead],
      schema: {
        tags: ['notifications'],
        summary: 'List notifications for the current staff user',
        security: [{ bearerAuth: [] }],
        querystring: listQuerySchema,
        response: { 200: paginatedSchema(notificationDtoSchema), ...errorResponses(401, 403) },
      },
    },
    async (request, reply) => {
      const tenant = requireTenant(request);
      const user = requireAuthUser(request);
      const { result, pagination } = await notificationService.listForStaff(
        tenant.clinicId,
        user.id,
        { filter: request.query.filter },
        request.query,
      );
      return reply.send(paginated(result, pagination));
    },
  );

  app.get(
    '/unread-count',
    {
      preHandler: [canRead],
      schema: {
        tags: ['notifications'],
        summary: 'Count unread notifications for the current staff user',
        security: [{ bearerAuth: [] }],
        response: {
          200: successSchema(z.object({ count: z.number().int().min(0) })),
          ...errorResponses(401, 403),
        },
      },
    },
    async (request, reply) => {
      const count = await notificationService.unreadCount(
        requireTenant(request).clinicId,
        requireAuthUser(request).id,
      );
      return reply.send({ success: true, data: { count } });
    },
  );

  app.post(
    '/read-all',
    {
      preHandler: [canRead],
      schema: {
        tags: ['notifications'],
        summary: 'Mark all current-user notifications read',
        security: [{ bearerAuth: [] }],
        response: {
          200: successSchema(
            z.object({ updatedCount: z.number().int().min(0), readAt: z.string() }),
          ),
          ...errorResponses(401, 403),
        },
      },
    },
    async (request, reply) => {
      const data = await notificationService.markAllRead(
        requireTenant(request).clinicId,
        requireAuthUser(request).id,
      );
      return reply.send({ success: true, data });
    },
  );

  app.post(
    '/:notificationId/read',
    {
      preHandler: [canRead],
      schema: {
        tags: ['notifications'],
        summary: 'Mark one current-user notification read',
        security: [{ bearerAuth: [] }],
        params: z.object({ notificationId: objectIdSchema }),
        response: {
          200: successSchema(notificationDtoSchema),
          ...errorResponses(401, 403, 404),
        },
      },
    },
    async (request, reply) => {
      const data = await notificationService.markRead(
        requireTenant(request).clinicId,
        requireAuthUser(request).id,
        request.params.notificationId,
      );
      return reply.send({ success: true, data });
    },
  );
};

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { mutationContext, requireTenant } from '../../common/utils/request-context.js';
import { paginated } from '../../common/utils/response.js';
import {
  errorResponses,
  paginatedSchema,
  successSchema,
} from '../../common/validation/api-schemas.js';
import { objectIdSchema, paginationQuerySchema } from '../../common/validation/common.schemas.js';
import { communicationService } from './communication.service.js';
import {
  COMMUNICATION_CHANNEL_VALUES,
  COMMUNICATION_JOB_STATUS_VALUES,
  COMMUNICATION_RECIPIENT_TYPE_VALUES,
} from './communication.types.js';

const jobDtoSchema = z.object({
  id: objectIdSchema,
  eventType: z.string(),
  patientId: objectIdSchema.nullable(),
  appointmentId: objectIdSchema.nullable(),
  recipientType: z.enum(COMMUNICATION_RECIPIENT_TYPE_VALUES),
  recipientId: objectIdSchema,
  channel: z.enum(COMMUNICATION_CHANNEL_VALUES),
  destinationMasked: z.string(),
  templateKey: z.string(),
  status: z.enum(COMMUNICATION_JOB_STATUS_VALUES),
  scheduledFor: z.string(),
  sentAt: z.string().nullable(),
  attemptCount: z.number().int(),
  lastErrorCode: z.string().nullable(),
  retryOfJobId: objectIdSchema.nullable(),
  createdAt: z.string(),
});
const listQuerySchema = paginationQuerySchema.extend({
  patientId: objectIdSchema.optional(),
  status: z.enum(COMMUNICATION_JOB_STATUS_VALUES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const communicationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.COMMUNICATION_READ)],
      schema: {
        tags: ['communications'],
        querystring: listQuerySchema,
        response: { 200: paginatedSchema(jobDtoSchema), ...errorResponses(401, 403) },
      },
    },
    async (request, reply) => {
      const { result, pagination } = await communicationService.list(
        requireTenant(request).clinicId,
        { patientId: request.query.patientId, status: request.query.status },
        request.query,
      );
      return reply.send(paginated(result, pagination));
    },
  );

  app.get(
    '/provider-status',
    {
      preHandler: [app.requirePermission(PERMISSIONS.COMMUNICATION_READ)],
      schema: {
        tags: ['communications'],
        response: {
          200: successSchema(
            z.object({ EMAIL: z.boolean(), SMS: z.boolean(), WHATSAPP: z.boolean() }),
          ),
          ...errorResponses(401, 403),
        },
      },
    },
    async (_request, reply) =>
      reply.send({ success: true, data: communicationService.providerStatus() }),
  );

  app.post(
    '/:jobId/retry',
    {
      preHandler: [app.requirePermission(PERMISSIONS.COMMUNICATION_MANAGE)],
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        tags: ['communications'],
        params: z.object({ jobId: objectIdSchema }),
        response: {
          202: successSchema(z.object({ queued: z.literal(true) })),
          ...errorResponses(401, 403, 404, 409, 429),
        },
      },
    },
    async (request, reply) => {
      await communicationService.retry(
        requireTenant(request).clinicId,
        request.params.jobId,
        mutationContext(request),
      );
      return reply.code(202).send({ success: true, data: { queued: true as const } });
    },
  );
};

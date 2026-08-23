import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, successSchema } from '../../common/validation/api-schemas.js';
import { listCareContinuityHandler, listFollowUpsHandler } from './follow-up.controller.js';
import {
  careContinuityListSchema,
  careContinuityQuerySchema,
  followUpListSchema,
  followUpQuerySchema,
} from './follow-up.schema.js';

export const followUpRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  app.get(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.FOLLOW_UP_READ)],
      schema: {
        tags: ['follow-ups'],
        summary: 'Derived clinic follow-up worklist',
        description:
          'Recommendations remain clinical-visit facts. This read model resolves them against future, active appointments without persisting a competing follow-up state.',
        security: [{ bearerAuth: [] }],
        querystring: followUpQuerySchema,
        response: { 200: successSchema(followUpListSchema), ...errorResponses(400, 401, 403, 404) },
      },
    },
    listFollowUpsHandler,
  );
  app.get(
    '/attention',
    {
      preHandler: [app.requirePermission(PERMISSIONS.FOLLOW_UP_READ)],
      schema: {
        tags: ['follow-ups'],
        summary: 'Derived care-continuity attention worklist',
        description:
          'Finds active treatment or retention patients without a qualifying future appointment. States are derived from clinical visits, appointments, and clinic thresholds.',
        security: [{ bearerAuth: [] }],
        querystring: careContinuityQuerySchema,
        response: {
          200: successSchema(careContinuityListSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    listCareContinuityHandler,
  );
};

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { hasPermission } from '../../common/authorization/policy.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, successSchema } from '../../common/validation/api-schemas.js';
import { dashboardResponseSchema } from './dashboard.schema.js';
import { dashboardService } from './dashboard.service.js';

export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/',
    {
      schema: {
        tags: ['dashboard'],
        summary: 'Operational command center dashboard',
        description:
          'Aggregates live clinic reception flow, next patient highlight, waiting/late queues, financial summary, urgent follow-ups, deterministic attention items, and recent activity.',
        response: {
          200: successSchema(dashboardResponseSchema),
          ...errorResponses(401, 403, 500),
        },
      },
    },
    async (request, reply) => {
      const tenant = request.tenant!;
      const user = request.authUser!;
      const includeFinance = hasPermission(tenant, PERMISSIONS.CASH_RECORD_READ);
      const includeClinical = hasPermission(tenant, PERMISSIONS.APPOINTMENT_READ);

      const dashboard = await dashboardService.getDashboard(
        tenant.clinicId,
        user.id,
        {
          includeFinance,
          includeClinical,
        },
      );

      return reply.code(200).send({
        success: true,
        data: dashboard,
      });
    },
  );
};

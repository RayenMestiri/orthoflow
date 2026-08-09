import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, successSchema } from '../../common/validation/api-schemas.js';
import { requireTenant } from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import { receptionService } from './reception.service.js';
import { receptionBoardDtoSchema } from './reception.schema.js';

/**
 * Today's clinic flow, mounted at `/api/v1/reception`.
 *
 * READ-ONLY. Marking a patient arrived, starting a visit and completing it are
 * appointment status transitions, and those endpoints already exist at
 * `POST /appointments/:appointmentId/status` and `/cancel`. Duplicating them
 * here would mean two places validating the same lifecycle and two places to
 * forget an audit entry.
 *
 * `appointment:read` gates the board, which already grants access to every
 * clinic role that works a front desk.
 */
export const receptionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/today',
    {
      preHandler: [app.requirePermission(PERMISSIONS.APPOINTMENT_READ)],
      schema: {
        tags: ['reception'],
        summary: "Today's clinic flow",
        description:
          'Every appointment in the clinic\'s current calendar day, grouped operationally: in ' +
          'treatment, waiting, arrived, late, upcoming, completed, closed. "Late" is derived ' +
          'from the scheduled start and is never stored. Durations are left to the client to ' +
          'derive from the timestamps returned here.',
        security: [{ bearerAuth: [] }],
        response: {
          200: successSchema(receptionBoardDtoSchema),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    async (request, reply) => {
      const board = await receptionService.getToday(requireTenant(request).clinicId);
      return reply.send(ok(board));
    },
  );
};

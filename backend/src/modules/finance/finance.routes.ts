import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  errorResponses,
  paginatedSchema,
  successSchema,
} from '../../common/validation/api-schemas.js';
import {
  getFinanceOverviewHandler,
  listFinanceActivityHandler,
  listPatientBalancesHandler,
} from './finance.controller.js';
import {
  financeActivityDtoSchema,
  financeActivityQuerySchema,
  financeOverviewDtoSchema,
  patientBalanceDtoSchema,
  patientBalanceQuerySchema,
} from './finance.schema.js';

/**
 * Clinic-wide financial operations, mounted at `/api/v1/finance`.
 *
 * READ-ONLY BY DESIGN. Recording and cancelling money stays on the cash-records
 * routes; this module only aggregates what those wrote. It therefore needs no
 * permission beyond `cash-record:read`, which already excludes assistants.
 */
export const financeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/overview',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CASH_RECORD_READ)],
      schema: {
        tags: ['finance'],
        summary: 'Clinic financial summary and operational worklist',
        description:
          'Money received today and this month, outstanding treatment value, and the counts ' +
          'behind the needs-attention strip. "Received" is money the clinic acknowledged; ' +
          '"outstanding" is unpaid agreed treatment value — the two are never added together. ' +
          'Today and month boundaries follow the clinic timezone.',
        security: [{ bearerAuth: [] }],
        response: {
          200: successSchema(financeOverviewDtoSchema),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    getFinanceOverviewHandler,
  );

  app.get(
    '/patient-balances',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CASH_RECORD_READ)],
      schema: {
        tags: ['finance'],
        summary: 'Paginated treatment balances across the clinic',
        description:
          'One row per treatment with an agreed price or recorded money. Status is derived ' +
          'from the figures, never stored. Search matches patient name or phone.',
        security: [{ bearerAuth: [] }],
        querystring: patientBalanceQuerySchema,
        response: {
          200: paginatedSchema(patientBalanceDtoSchema),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    listPatientBalancesHandler,
  );

  app.get(
    '/activity',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CASH_RECORD_READ)],
      schema: {
        tags: ['finance'],
        summary: 'Recent financial movements clinic-wide',
        description: 'Newest recorded and cancelled payments, with patient and actor resolved.',
        security: [{ bearerAuth: [] }],
        querystring: financeActivityQuerySchema,
        response: {
          200: successSchema(z.array(financeActivityDtoSchema)),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    listFinanceActivityHandler,
  );
};

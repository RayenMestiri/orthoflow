import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  errorResponses,
  paginatedSchema,
  successSchema,
} from '../../common/validation/api-schemas.js';
import {
  cancelCashRecordHandler,
  getCashRecordHandler,
  getPatientFinancialSummaryHandler,
  getTreatmentFinancialSummaryHandler,
  listPatientCashRecordsHandler,
  recordPaymentHandler,
} from './cash-record.controller.js';
import {
  cancelCashRecordBodySchema,
  cashRecordDtoSchema,
  cashRecordIdParamSchema,
  cashRecordListQuerySchema,
  financialSummaryDtoSchema,
  patientIdParamSchema,
  recordPaymentBodySchema,
  treatmentIdParamSchema,
} from './cash-record.schema.js';

/**
 * Patient-scoped financial routes, mounted at `/api/v1/patients`.
 *
 * NOTE ON SEMANTICS: "record payment" means *the clinic acknowledges money it
 * has already physically received*. Nothing here charges anyone, moves funds or
 * touches a payment instrument.
 */
export const patientCashRecordRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/:patientId/cash-records',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CASH_RECORD_READ)],
      schema: {
        tags: ['cash-records'],
        summary: 'List a patient payment history',
        description:
          'Newest first. Cancelled records remain in the list and are excluded from totals.',
        security: [{ bearerAuth: [] }],
        params: patientIdParamSchema,
        querystring: cashRecordListQuerySchema,
        response: {
          200: paginatedSchema(cashRecordDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    listPatientCashRecordsHandler,
  );

  app.post(
    '/:patientId/cash-records',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CASH_RECORD_CREATE)],
      schema: {
        tags: ['cash-records'],
        summary: 'Record money received from a patient',
        description:
          'Records money the clinic has physically received; it does not process a payment. ' +
          'Issues a receipt in the same operation. Send `idempotencyKey` so a double ' +
          'submission returns the original record instead of creating a second one. A payment ' +
          'larger than the treatment balance returns 422 PAYMENT_EXCEEDS_REMAINING_AMOUNT; an ' +
          'authorized caller may repeat the request with `allowOverpayment: true`.',
        security: [{ bearerAuth: [] }],
        params: patientIdParamSchema,
        body: recordPaymentBodySchema,
        response: {
          201: successSchema(cashRecordDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    recordPaymentHandler,
  );

  app.get(
    '/:patientId/financial-summary',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CASH_RECORD_READ)],
      schema: {
        tags: ['cash-records'],
        summary: 'Derived financial position for a patient',
        description:
          'Recorded totals are summed from cash records on every read. No balance is stored, ' +
          'and none is ever accepted from a client.',
        security: [{ bearerAuth: [] }],
        params: patientIdParamSchema,
        response: {
          200: successSchema(financialSummaryDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getPatientFinancialSummaryHandler,
  );
};

/**
 * Record-scoped routes, mounted at `/api/v1/cash-records`.
 *
 * There is deliberately **no DELETE and no PATCH**: a financial record is never
 * removed or edited in place. A mistake is cancelled with a reason, and the
 * corrected amount is a new record that links back to it.
 */
export const cashRecordRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/:cashRecordId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CASH_RECORD_READ)],
      schema: {
        tags: ['cash-records'],
        summary: 'Get one payment record',
        security: [{ bearerAuth: [] }],
        params: cashRecordIdParamSchema,
        response: {
          200: successSchema(cashRecordDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getCashRecordHandler,
  );

  app.post(
    '/:cashRecordId/cancel',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CASH_RECORD_CANCEL)],
      schema: {
        tags: ['cash-records'],
        summary: 'Cancel an incorrect payment record',
        description:
          'The record stays visible in financial history and stops counting toward recorded ' +
          'totals. Its receipt is marked cancelled with its printed amount untouched.',
        security: [{ bearerAuth: [] }],
        params: cashRecordIdParamSchema,
        body: cancelCashRecordBodySchema,
        response: {
          200: successSchema(cashRecordDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    cancelCashRecordHandler,
  );
};

/**
 * Treatment-scoped financial summary, mounted at `/api/v1/treatments`.
 *
 * PARALLEL-WORK NOTE: this is a Cash Records route that happens to hang off a
 * treatment id. It lives in this module, reads Treatment through its public
 * repository, and modifies no Treatment-owned file.
 */
export const treatmentFinancialRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/:treatmentId/financial-summary',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CASH_RECORD_READ)],
      schema: {
        tags: ['cash-records'],
        summary: 'Derived financial position for one treatment',
        description:
          'Agreed price comes from the treatment; recorded and remaining are derived from cash ' +
          'records.',
        security: [{ bearerAuth: [] }],
        params: treatmentIdParamSchema,
        response: {
          200: successSchema(financialSummaryDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getTreatmentFinancialSummaryHandler,
  );
};

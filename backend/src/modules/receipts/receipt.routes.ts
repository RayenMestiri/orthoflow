import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, successSchema } from '../../common/validation/api-schemas.js';
import { cashRecordIdParamSchema } from '../cash-records/cash-record.schema.js';
import { getReceiptForCashRecordHandler, getReceiptHandler } from './receipt.controller.js';
import { receiptDocumentDtoSchema, receiptIdParamSchema } from './receipt.schema.js';

/**
 * Receipt reads on a cash record, mounted at `/api/v1/cash-records`.
 *
 * Read-only by design: a receipt is issued with its payment, never on request.
 * An endpoint that minted receipts independently would be a way to produce a
 * document for money nobody received.
 */
export const cashRecordReceiptRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/:cashRecordId/receipt',
    {
      preHandler: [app.requirePermission(PERMISSIONS.RECEIPT_READ)],
      schema: {
        tags: ['receipts'],
        summary: 'Get the printable receipt for a payment record',
        description:
          'Returns everything the printed receipt shows, with clinic, patient and payer names ' +
          'already resolved.',
        security: [{ bearerAuth: [] }],
        params: cashRecordIdParamSchema,
        response: {
          200: successSchema(receiptDocumentDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getReceiptForCashRecordHandler,
  );
};

/** Direct receipt lookup, mounted at `/api/v1/receipts`. */
export const receiptRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/:receiptId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.RECEIPT_READ)],
      schema: {
        tags: ['receipts'],
        summary: 'Get one receipt by id',
        security: [{ bearerAuth: [] }],
        params: receiptIdParamSchema,
        response: {
          200: successSchema(receiptDocumentDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getReceiptHandler,
  );
};

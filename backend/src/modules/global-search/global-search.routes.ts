import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorResponses, successSchema } from '../../common/validation/api-schemas.js';
import { globalSearchHandler } from './global-search.controller.js';
import { globalSearchQuerySchema } from './global-search.schema.js';

const searchResultItemSchema = z.object({
  id: z.string(),
  type: z.enum(['PATIENT', 'RECEIPT', 'TREATMENT', 'APPOINTMENT', 'DOCUMENT']),
  title: z.string(),
  subtitle: z.string().nullable(),
  badge: z.string().nullable(),
  meta: z.string().nullable(),
  patientId: z.string().nullable(),
  patientName: z.string().nullable(),
  targetId: z.string(),
  target: z.enum([
    'PATIENT_PROFILE',
    'RECEIPT_DETAIL',
    'TREATMENT_DETAIL',
    'APPOINTMENT_DETAIL',
    'DOCUMENT_VIEWER',
  ]),
  route: z.array(z.string()),
  queryParams: z.record(z.string(), z.string()).nullable(),
});

const searchGroupSchema = z.object({
  category: z.enum(['PATIENTS', 'RECEIPTS', 'TREATMENTS', 'APPOINTMENTS', 'DOCUMENTS']),
  label: z.string(),
  items: z.array(searchResultItemSchema),
});

const searchResponseSchema = z.object({
  query: z.string(),
  totalMatches: z.number(),
  groups: z.array(searchGroupSchema),
});

export const globalSearchRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/',
    {
      schema: {
        tags: ['search'],
        summary: 'Global multi-collection command center search',
        security: [{ bearerAuth: [] }],
        querystring: globalSearchQuerySchema,
        response: {
          200: successSchema(searchResponseSchema),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    globalSearchHandler,
  );
};

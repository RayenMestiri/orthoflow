import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, successSchema } from '../../common/validation/api-schemas.js';
import {
  cancelRetentionHandler,
  completeRetentionHandler,
  createRetentionHandler,
  deliverRetainerHandler,
  discontinueRetainerHandler,
  getTreatmentRetentionHandler,
  listPatientRetentionHandler,
  markRetainerLostHandler,
  replaceRetainerHandler,
  updateRetentionHandler,
} from './retention.controller.js';
import {
  closeRetentionBodySchema,
  createRetentionBodySchema,
  patientRetentionParamSchema,
  retainerParamSchema,
  retainerWriteBodySchema,
  retentionPlanDtoSchema,
  retentionPlanParamSchema,
  treatmentRetentionParamSchema,
  updateRetentionBodySchema,
} from './retention.schema.js';

export const patientRetentionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  app.get(
    '/:patientId/retention-plans',
    {
      preHandler: [app.requirePermission(PERMISSIONS.RETENTION_READ)],
      schema: {
        tags: ['retention'],
        summary: 'List retention plans for a patient',
        security: [{ bearerAuth: [] }],
        params: patientRetentionParamSchema,
        response: {
          200: successSchema(z.array(retentionPlanDtoSchema)),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    listPatientRetentionHandler,
  );
};

export const treatmentRetentionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  app.get(
    '/:treatmentId/retention-plan',
    {
      preHandler: [app.requirePermission(PERMISSIONS.RETENTION_READ)],
      schema: {
        tags: ['retention'],
        summary: 'Get the retention plan linked to a treatment',
        security: [{ bearerAuth: [] }],
        params: treatmentRetentionParamSchema,
        response: {
          200: successSchema(retentionPlanDtoSchema.nullable()),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getTreatmentRetentionHandler,
  );
  app.post(
    '/:treatmentId/retention-plan',
    {
      preHandler: [app.requirePermission(PERMISSIONS.RETENTION_MANAGE)],
      schema: {
        tags: ['retention'],
        summary: 'Create retention for a completed treatment',
        security: [{ bearerAuth: [] }],
        params: treatmentRetentionParamSchema,
        body: createRetentionBodySchema,
        response: {
          201: successSchema(retentionPlanDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    createRetentionHandler,
  );
};

export const retentionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  const manage = app.requirePermission(PERMISSIONS.RETENTION_MANAGE);
  app.patch(
    '/:retentionPlanId',
    {
      preHandler: [manage],
      schema: {
        tags: ['retention'],
        summary: 'Update an open retention plan',
        security: [{ bearerAuth: [] }],
        params: retentionPlanParamSchema,
        body: updateRetentionBodySchema,
        response: { 200: successSchema(retentionPlanDtoSchema), ...errorResponses(400, 401, 403, 404, 422) },
      },
    },
    updateRetentionHandler,
  );
  app.post(
    '/:retentionPlanId/retainers',
    {
      preHandler: [manage],
      schema: {
        tags: ['retention'],
        summary: 'Deliver a retainer',
        security: [{ bearerAuth: [] }],
        params: retentionPlanParamSchema,
        body: retainerWriteBodySchema,
        response: { 201: successSchema(retentionPlanDtoSchema), ...errorResponses(400, 401, 403, 404, 422) },
      },
    },
    deliverRetainerHandler,
  );
  app.post(
    '/:retentionPlanId/retainers/:retainerId/replace',
    {
      preHandler: [manage],
      schema: {
        tags: ['retention'],
        summary: 'Replace an active retainer while preserving history',
        security: [{ bearerAuth: [] }],
        params: retainerParamSchema,
        body: retainerWriteBodySchema,
        response: { 200: successSchema(retentionPlanDtoSchema), ...errorResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    replaceRetainerHandler,
  );
  app.post(
    '/:retentionPlanId/retainers/:retainerId/lost',
    {
      preHandler: [manage],
      schema: {
        tags: ['retention'],
        summary: 'Mark an active retainer lost',
        security: [{ bearerAuth: [] }],
        params: retainerParamSchema,
        response: { 200: successSchema(retentionPlanDtoSchema), ...errorResponses(400, 401, 403, 404, 422) },
      },
    },
    markRetainerLostHandler,
  );
  app.post(
    '/:retentionPlanId/retainers/:retainerId/discontinue',
    {
      preHandler: [manage],
      schema: {
        tags: ['retention'],
        summary: 'Discontinue an active retainer',
        security: [{ bearerAuth: [] }],
        params: retainerParamSchema,
        response: { 200: successSchema(retentionPlanDtoSchema), ...errorResponses(400, 401, 403, 404, 422) },
      },
    },
    discontinueRetainerHandler,
  );
  app.post(
    '/:retentionPlanId/complete',
    {
      preHandler: [manage],
      schema: {
        tags: ['retention'],
        summary: 'Complete long-term retention follow-up',
        security: [{ bearerAuth: [] }],
        params: retentionPlanParamSchema,
        body: closeRetentionBodySchema,
        response: { 200: successSchema(retentionPlanDtoSchema), ...errorResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    completeRetentionHandler,
  );
  app.post(
    '/:retentionPlanId/cancel',
    {
      preHandler: [manage],
      schema: {
        tags: ['retention'],
        summary: 'Cancel retention without deleting history',
        security: [{ bearerAuth: [] }],
        params: retentionPlanParamSchema,
        body: closeRetentionBodySchema,
        response: { 200: successSchema(retentionPlanDtoSchema), ...errorResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    cancelRetentionHandler,
  );
};

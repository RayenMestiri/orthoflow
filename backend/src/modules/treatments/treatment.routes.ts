import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  errorResponses,
  paginatedSchema,
  successSchema,
} from '../../common/validation/api-schemas.js';
import {
  cancelTreatmentHandler,
  completeTreatmentHandler,
  createTreatmentHandler,
  createTreatmentMilestoneHandler,
  getTreatmentHandler,
  listPatientTreatmentsHandler,
  listTreatmentMilestonesHandler,
  pauseTreatmentHandler,
  resumeTreatmentHandler,
  startTreatmentHandler,
  updateTreatmentHandler,
  updateTreatmentMilestoneHandler,
} from './treatment.controller.js';
import {
  cancelTreatmentBodySchema,
  completeTreatmentBodySchema,
  createTreatmentBodySchema,
  createTreatmentMilestoneBodySchema,
  patientIdParamSchema,
  patientTreatmentsQuerySchema,
  pauseTreatmentBodySchema,
  resumeTreatmentBodySchema,
  startTreatmentBodySchema,
  treatmentDtoSchema,
  treatmentIdParamSchema,
  treatmentMilestoneDtoSchema,
  treatmentMilestoneIdParamSchema,
  treatmentMilestonesQuerySchema,
  treatmentWithMilestonesDtoSchema,
  updateTreatmentBodySchema,
  updateTreatmentMilestoneBodySchema,
} from './treatment.schema.js';

export const patientTreatmentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/:patientId/treatments',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_READ)],
      schema: {
        tags: ['treatments'],
        summary: 'List a patient treatment history',
        security: [{ bearerAuth: [] }],
        params: patientIdParamSchema,
        querystring: patientTreatmentsQuerySchema,
        response: {
          200: successSchema(z.array(treatmentWithMilestonesDtoSchema)),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    listPatientTreatmentsHandler,
  );

  app.post(
    '/:patientId/treatments',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_CREATE)],
      schema: {
        tags: ['treatments'],
        summary: 'Create an orthodontic treatment plan',
        security: [{ bearerAuth: [] }],
        params: patientIdParamSchema,
        body: createTreatmentBodySchema,
        response: {
          201: successSchema(treatmentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    createTreatmentHandler,
  );
};

export const treatmentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/:treatmentId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_READ)],
      schema: {
        tags: ['treatments'],
        summary: 'Get one treatment',
        security: [{ bearerAuth: [] }],
        params: treatmentIdParamSchema,
        response: { 200: successSchema(treatmentDtoSchema), ...errorResponses(400, 401, 403, 404) },
      },
    },
    getTreatmentHandler,
  );

  app.patch(
    '/:treatmentId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_UPDATE)],
      schema: {
        tags: ['treatments'],
        summary: 'Update editable treatment-plan fields',
        security: [{ bearerAuth: [] }],
        params: treatmentIdParamSchema,
        body: updateTreatmentBodySchema,
        response: {
          200: successSchema(treatmentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    updateTreatmentHandler,
  );

  const lifecycle = PERMISSIONS.TREATMENT_MANAGE_LIFECYCLE;
  app.post(
    '/:treatmentId/start',
    {
      preHandler: [app.requirePermission(lifecycle)],
      schema: {
        tags: ['treatments'],
        summary: 'Start a planned treatment',
        security: [{ bearerAuth: [] }],
        params: treatmentIdParamSchema,
        body: startTreatmentBodySchema,
        response: {
          200: successSchema(treatmentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    startTreatmentHandler,
  );
  app.post(
    '/:treatmentId/pause',
    {
      preHandler: [app.requirePermission(lifecycle)],
      schema: {
        tags: ['treatments'],
        summary: 'Pause an active treatment',
        security: [{ bearerAuth: [] }],
        params: treatmentIdParamSchema,
        body: pauseTreatmentBodySchema,
        response: {
          200: successSchema(treatmentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    pauseTreatmentHandler,
  );
  app.post(
    '/:treatmentId/resume',
    {
      preHandler: [app.requirePermission(lifecycle)],
      schema: {
        tags: ['treatments'],
        summary: 'Resume a paused treatment',
        security: [{ bearerAuth: [] }],
        params: treatmentIdParamSchema,
        body: resumeTreatmentBodySchema,
        response: {
          200: successSchema(treatmentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    resumeTreatmentHandler,
  );
  app.post(
    '/:treatmentId/complete',
    {
      preHandler: [app.requirePermission(lifecycle)],
      schema: {
        tags: ['treatments'],
        summary: 'Complete an active treatment',
        security: [{ bearerAuth: [] }],
        params: treatmentIdParamSchema,
        body: completeTreatmentBodySchema,
        response: {
          200: successSchema(treatmentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    completeTreatmentHandler,
  );
  app.post(
    '/:treatmentId/cancel',
    {
      preHandler: [app.requirePermission(lifecycle)],
      schema: {
        tags: ['treatments'],
        summary: 'Cancel a treatment without deleting its history',
        security: [{ bearerAuth: [] }],
        params: treatmentIdParamSchema,
        body: cancelTreatmentBodySchema,
        response: {
          200: successSchema(treatmentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    cancelTreatmentHandler,
  );

  app.get(
    '/:treatmentId/milestones',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_READ)],
      schema: {
        tags: ['treatments'],
        summary: 'List treatment milestones',
        security: [{ bearerAuth: [] }],
        params: treatmentIdParamSchema,
        querystring: treatmentMilestonesQuerySchema,
        response: {
          200: paginatedSchema(treatmentMilestoneDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    listTreatmentMilestonesHandler,
  );
  app.post(
    '/:treatmentId/milestones',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_UPDATE)],
      schema: {
        tags: ['treatments'],
        summary: 'Record a treatment milestone',
        security: [{ bearerAuth: [] }],
        params: treatmentIdParamSchema,
        body: createTreatmentMilestoneBodySchema,
        response: {
          201: successSchema(treatmentMilestoneDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    createTreatmentMilestoneHandler,
  );
  app.patch(
    '/:treatmentId/milestones/:milestoneId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_UPDATE)],
      schema: {
        tags: ['treatments'],
        summary: 'Correct a persisted milestone',
        security: [{ bearerAuth: [] }],
        params: treatmentMilestoneIdParamSchema,
        body: updateTreatmentMilestoneBodySchema,
        response: {
          200: successSchema(treatmentMilestoneDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    updateTreatmentMilestoneHandler,
  );
};

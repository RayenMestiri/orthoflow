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
  createTreatmentProgressHandler,
  getTreatmentHandler,
  listPatientTreatmentsHandler,
  listTreatmentProgressHandler,
  pauseTreatmentHandler,
  resumeTreatmentHandler,
  startTreatmentHandler,
  updateTreatmentHandler,
} from './treatment.controller.js';
import {
  cancelTreatmentBodySchema,
  completeTreatmentBodySchema,
  createTreatmentBodySchema,
  createTreatmentProgressBodySchema,
  patientIdParamSchema,
  patientTreatmentsQuerySchema,
  pauseTreatmentBodySchema,
  resumeTreatmentBodySchema,
  startTreatmentBodySchema,
  treatmentDtoSchema,
  treatmentIdParamSchema,
  treatmentProgressDtoSchema,
  treatmentProgressQuerySchema,
  treatmentWithProgressDtoSchema,
  updateTreatmentBodySchema,
} from './treatment.schema.js';

/**
 * Patient-scoped treatment routes, mounted at `/api/v1/patients`.
 *
 * A treatment only ever exists inside a patient file, so listing and creating
 * live under the patient. Everything that acts on one existing course lives in
 * `treatmentRoutes` below, where the id alone identifies it.
 */
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
        description:
          'Newest first, with each course’s progress timeline attached unless ' +
          '`includeProgress=false`.',
        security: [{ bearerAuth: [] }],
        params: patientIdParamSchema,
        querystring: patientTreatmentsQuerySchema,
        response: {
          200: successSchema(z.array(treatmentWithProgressDtoSchema)),
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
        summary: 'Plan a treatment for a patient',
        description:
          'Defaults to PLANNED. Passing status ACTIVE starts care immediately and is ' +
          'refused when the patient already has a course in progress.',
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

/**
 * Treatment-scoped routes, mounted at `/api/v1/treatments`.
 *
 * Each status move is its own endpoint rather than a `PATCH status`, so the
 * transition rules and the audit trail have somewhere honest to live.
 */
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
        response: {
          200: successSchema(treatmentDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
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
        summary: 'Update a treatment plan',
        description: 'Plan fields only. Completed and cancelled treatments are read-only.',
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

  app.post(
    '/:treatmentId/start',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_MANAGE_LIFECYCLE)],
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
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_MANAGE_LIFECYCLE)],
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
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_MANAGE_LIFECYCLE)],
      schema: {
        tags: ['treatments'],
        summary: 'Resume a paused treatment',
        security: [{ bearerAuth: [] }],
        params: treatmentIdParamSchema,
        body: resumeTreatmentBodySchema,
        response: {
          200: successSchema(treatmentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    resumeTreatmentHandler,
  );

  app.post(
    '/:treatmentId/complete',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_MANAGE_LIFECYCLE)],
      schema: {
        tags: ['treatments'],
        summary: 'Complete a treatment',
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
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_MANAGE_LIFECYCLE)],
      schema: {
        tags: ['treatments'],
        summary: 'Cancel a treatment',
        description: 'Treatments are never deleted — an abandoned course stays in the file.',
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
    '/:treatmentId/progress',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_READ)],
      schema: {
        tags: ['treatments'],
        summary: 'List a treatment progress timeline',
        security: [{ bearerAuth: [] }],
        params: treatmentIdParamSchema,
        querystring: treatmentProgressQuerySchema,
        response: {
          200: paginatedSchema(treatmentProgressDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    listTreatmentProgressHandler,
  );

  app.post(
    '/:treatmentId/progress',
    {
      preHandler: [app.requirePermission(PERMISSIONS.TREATMENT_PROGRESS_CREATE)],
      schema: {
        tags: ['treatments'],
        summary: 'Record a progress entry',
        description:
          'Chairside note for a course of care. Lifecycle events (started, paused, ' +
          'completed) are written by the server and cannot be posted here.',
        security: [{ bearerAuth: [] }],
        params: treatmentIdParamSchema,
        body: createTreatmentProgressBodySchema,
        response: {
          201: successSchema(treatmentProgressDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    createTreatmentProgressHandler,
  );
};

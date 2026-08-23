import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, successSchema } from '../../common/validation/api-schemas.js';
import { objectIdSchema } from '../../common/validation/common.schemas.js';
import {
  createPatientGuardianHandler,
  getGuardianChildrenHandler,
  linkExistingPatientGuardianHandler,
  listPatientGuardiansHandler,
  makePrimaryPatientGuardianHandler,
  searchGuardiansHandler,
  unlinkPatientGuardianHandler,
  updatePatientGuardianHandler,
} from './guardian.controller.js';
import {
  createGuardianBodySchema,
  guardianChildDtoSchema,
  guardianDtoSchema,
  guardianSearchDtoSchema,
  guardianSearchQuerySchema,
  linkExistingGuardianBodySchema,
  patientGuardianParamSchema,
  patientParamSchema,
  updateGuardianBodySchema,
} from './guardian.schema.js';

export const guardianRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/:patientId/guardians',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GUARDIAN_READ)],
      schema: {
        tags: ['guardians'],
        summary: 'List guardians linked to a patient',
        security: [{ bearerAuth: [] }],
        params: patientParamSchema,
        response: {
          200: successSchema(z.array(guardianDtoSchema)),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    listPatientGuardiansHandler,
  );

  app.post(
    '/:patientId/guardians',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GUARDIAN_CREATE)],
      schema: {
        tags: ['guardians'],
        summary: 'Create and link a new guardian to a patient',
        security: [{ bearerAuth: [] }],
        params: patientParamSchema,
        body: createGuardianBodySchema,
        response: {
          201: successSchema(guardianDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    createPatientGuardianHandler,
  );

  app.post(
    '/:patientId/guardians/link-existing',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GUARDIAN_CREATE)],
      schema: {
        tags: ['guardians'],
        summary: 'Link an existing guardian to a patient',
        security: [{ bearerAuth: [] }],
        params: patientParamSchema,
        body: linkExistingGuardianBodySchema,
        response: {
          201: successSchema(guardianDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409),
        },
      },
    },
    linkExistingPatientGuardianHandler,
  );

  app.patch(
    '/:patientId/guardians/:guardianId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GUARDIAN_UPDATE)],
      schema: {
        tags: ['guardians'],
        summary: 'Update guardian and relationship details',
        security: [{ bearerAuth: [] }],
        params: patientGuardianParamSchema,
        body: updateGuardianBodySchema,
        response: {
          200: successSchema(guardianDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    updatePatientGuardianHandler,
  );

  app.post(
    '/:patientId/guardians/:guardianId/make-primary',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GUARDIAN_UPDATE)],
      schema: {
        tags: ['guardians'],
        summary: 'Set a guardian as primary contact for this patient',
        security: [{ bearerAuth: [] }],
        params: patientGuardianParamSchema,
        response: {
          200: successSchema(guardianDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    makePrimaryPatientGuardianHandler,
  );

  app.delete(
    '/:patientId/guardians/:guardianId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GUARDIAN_DELETE)],
      schema: {
        tags: ['guardians'],
        summary: 'Unlink a guardian from a patient',
        security: [{ bearerAuth: [] }],
        params: patientGuardianParamSchema,
        response: {
          200: successSchema(z.object({ unlinked: z.literal(true) })),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    unlinkPatientGuardianHandler,
  );

  app.get(
    '/:patientId/guardians/:guardianId/children',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GUARDIAN_READ)],
      schema: {
        tags: ['guardians'],
        summary: 'Get all children linked to this guardian in the clinic',
        security: [{ bearerAuth: [] }],
        params: patientGuardianParamSchema,
        response: {
          200: successSchema(z.array(guardianChildDtoSchema)),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getGuardianChildrenHandler,
  );
};

export const standaloneGuardianRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/search',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GUARDIAN_READ)],
      schema: {
        tags: ['guardians'],
        summary: 'Search guardians in the clinic for linking',
        security: [{ bearerAuth: [] }],
        querystring: guardianSearchQuerySchema,
        response: {
          200: successSchema(z.array(guardianSearchDtoSchema)),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    searchGuardiansHandler,
  );

  app.get(
    '/:guardianId/children',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GUARDIAN_READ)],
      schema: {
        tags: ['guardians'],
        summary: 'Get all children linked to this guardian in the clinic',
        security: [{ bearerAuth: [] }],
        params: z.object({ guardianId: objectIdSchema }),
        response: {
          200: successSchema(z.array(guardianChildDtoSchema)),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getGuardianChildrenHandler,
  );
};


import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, successSchema } from '../../common/validation/api-schemas.js';
import {
  createPatientGuardianHandler,
  listPatientGuardiansHandler,
  updatePatientGuardianHandler,
} from './guardian.controller.js';
import {
  createGuardianBodySchema,
  guardianDtoSchema,
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
        summary: 'Create and link a guardian to a patient',
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
};

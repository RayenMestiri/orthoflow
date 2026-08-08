import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, successSchema } from '../../common/validation/api-schemas.js';
import {
  getClinicHandler,
  listMyClinicsHandler,
  updateClinicHandler,
} from './clinic.controller.js';
import { clinicDtoSchema, clinicIdParamSchema, updateClinicBodySchema } from './clinic.schema.js';

export const clinicRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['clinics'],
        summary: 'Clinics the current user belongs to',
        security: [{ bearerAuth: [] }],
        response: {
          200: successSchema(z.array(clinicDtoSchema)),
          ...errorResponses(401),
        },
      },
    },
    listMyClinicsHandler,
  );

  app.get(
    '/:clinicId',
    {
      preHandler: [
        app.authenticate,
        app.requireClinic({ param: 'clinicId' }),
        app.requirePermission(PERMISSIONS.CLINIC_READ),
      ],
      schema: {
        tags: ['clinics'],
        summary: 'Get a clinic profile',
        security: [{ bearerAuth: [] }],
        params: clinicIdParamSchema,
        response: {
          200: successSchema(clinicDtoSchema),
          ...errorResponses(401, 403, 404),
        },
      },
    },
    getClinicHandler,
  );

  app.patch(
    '/:clinicId',
    {
      preHandler: [
        app.authenticate,
        app.requireClinic({ param: 'clinicId' }),
        app.requirePermission(PERMISSIONS.CLINIC_UPDATE),
      ],
      schema: {
        tags: ['clinics'],
        summary: 'Update a clinic profile',
        security: [{ bearerAuth: [] }],
        params: clinicIdParamSchema,
        body: updateClinicBodySchema,
        response: {
          200: successSchema(clinicDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    updateClinicHandler,
  );
};

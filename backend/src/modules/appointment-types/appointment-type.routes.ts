import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, successSchema } from '../../common/validation/api-schemas.js';
import {
  createAppointmentTypeHandler,
  listAppointmentTypesHandler,
  updateAppointmentTypeHandler,
} from './appointment-type.controller.js';
import {
  appointmentTypeDtoSchema,
  appointmentTypeIdParamSchema,
  appointmentTypeListQuerySchema,
  createAppointmentTypeBodySchema,
  updateAppointmentTypeBodySchema,
} from './appointment-type.schema.js';

/** Mounted at `/api/v1/appointment-types`. */
export const appointmentTypeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.APPOINTMENT_TYPE_READ)],
      schema: {
        tags: ['appointment-types'],
        summary: 'List the clinic appointment types',
        description:
          'Active types only by default — this is what the booking form offers. Retired types ' +
          'are still returned with `includeInactive` so historical appointments stay readable.',
        security: [{ bearerAuth: [] }],
        querystring: appointmentTypeListQuerySchema,
        response: {
          200: successSchema(z.array(appointmentTypeDtoSchema)),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    listAppointmentTypesHandler,
  );

  app.post(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.APPOINTMENT_TYPE_MANAGE)],
      schema: {
        tags: ['appointment-types'],
        summary: 'Create an appointment type',
        security: [{ bearerAuth: [] }],
        body: createAppointmentTypeBodySchema,
        response: {
          201: successSchema(appointmentTypeDtoSchema),
          ...errorResponses(400, 401, 403, 409),
        },
      },
    },
    createAppointmentTypeHandler,
  );

  app.patch(
    '/:appointmentTypeId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.APPOINTMENT_TYPE_MANAGE)],
      schema: {
        tags: ['appointment-types'],
        summary: 'Update or retire an appointment type',
        description:
          'Types are retired with `isActive: false`, never deleted — past appointments must keep ' +
          'resolving to the kind of visit that actually happened.',
        security: [{ bearerAuth: [] }],
        params: appointmentTypeIdParamSchema,
        body: updateAppointmentTypeBodySchema,
        response: {
          200: successSchema(appointmentTypeDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409),
        },
      },
    },
    updateAppointmentTypeHandler,
  );
};

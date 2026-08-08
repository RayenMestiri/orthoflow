import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, paginatedSchema, successSchema } from '../../common/validation/api-schemas.js';
import {
  cancelAppointmentHandler,
  changeAppointmentStatusHandler,
  createAppointmentHandler,
  getAppointmentHandler,
  getAppointmentActivityHandler,
  listAppointmentsHandler,
  updateAppointmentHandler,
} from './appointment.controller.js';
import {
  appointmentDtoSchema,
  appointmentActivityDtoSchema,
  appointmentActivityQuerySchema,
  appointmentIdParamSchema,
  appointmentListQuerySchema,
  cancelAppointmentBodySchema,
  changeStatusBodySchema,
  createAppointmentBodySchema,
  updateAppointmentBodySchema,
} from './appointment.schema.js';

/** Mounted at `/api/v1/appointments`. */
export const appointmentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.APPOINTMENT_READ)],
      schema: {
        tags: ['appointments'],
        summary: 'List appointments in a date range',
        description:
          'Returns every appointment intersecting [start, end), joined with patient and ' +
          'appointment-type summaries. The range is capped at 62 days — fetch what the ' +
          'calendar shows, not the whole history.',
        security: [{ bearerAuth: [] }],
        querystring: appointmentListQuerySchema,
        response: {
          200: successSchema(z.array(appointmentDtoSchema)),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    listAppointmentsHandler,
  );

  app.post(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.APPOINTMENT_CREATE)],
      schema: {
        tags: ['appointments'],
        summary: 'Create an appointment',
        description:
          'Duration defaults from the appointment type. The doctor is the clinic owner, resolved ' +
          'server-side. A slot above clinic capacity returns a contextual 422 warning and can be ' +
          'retried with explicit owner approval; times outside working hours remain invalid.',
        security: [{ bearerAuth: [] }],
        body: createAppointmentBodySchema,
        response: {
          201: successSchema(appointmentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    createAppointmentHandler,
  );

  app.get(
    '/:appointmentId/activity',
    {
      preHandler: [app.requirePermission(PERMISSIONS.APPOINTMENT_READ)],
      schema: {
        tags: ['appointments'],
        summary: 'Read appointment activity',
        security: [{ bearerAuth: [] }],
        params: appointmentIdParamSchema,
        querystring: appointmentActivityQuerySchema,
        response: {
          200: paginatedSchema(appointmentActivityDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getAppointmentActivityHandler,
  );

  app.get(
    '/:appointmentId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.APPOINTMENT_READ)],
      schema: {
        tags: ['appointments'],
        summary: 'Get one appointment',
        security: [{ bearerAuth: [] }],
        params: appointmentIdParamSchema,
        response: {
          200: successSchema(appointmentDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getAppointmentHandler,
  );

  app.patch(
    '/:appointmentId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.APPOINTMENT_UPDATE)],
      schema: {
        tags: ['appointments'],
        summary: 'Edit or reschedule an appointment',
        description:
          'Drag, resize and drawer edits all land here. Closed appointments (completed, no-show, ' +
          'cancelled) can no longer be edited.',
        security: [{ bearerAuth: [] }],
        params: appointmentIdParamSchema,
        body: updateAppointmentBodySchema,
        response: {
          200: successSchema(appointmentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    updateAppointmentHandler,
  );

  app.post(
    '/:appointmentId/status',
    {
      preHandler: [app.requirePermission(PERMISSIONS.APPOINTMENT_UPDATE)],
      schema: {
        tags: ['appointments'],
        summary: 'Move an appointment through its operational workflow',
        description:
          'Confirm, arrival, waiting, in-treatment, completed and no-show. Transitions are ' +
          'validated server-side; going backwards or leaving a terminal state is rejected. ' +
          'Cancellation has its own endpoint.',
        security: [{ bearerAuth: [] }],
        params: appointmentIdParamSchema,
        body: changeStatusBodySchema,
        response: {
          200: successSchema(appointmentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    changeAppointmentStatusHandler,
  );

  app.post(
    '/:appointmentId/cancel',
    {
      preHandler: [app.requirePermission(PERMISSIONS.APPOINTMENT_CANCEL)],
      schema: {
        tags: ['appointments'],
        summary: 'Cancel an appointment',
        description:
          'Cancel is not delete: the appointment keeps its history, plus who cancelled it, when ' +
          'and the optional reason.',
        security: [{ bearerAuth: [] }],
        params: appointmentIdParamSchema,
        body: cancelAppointmentBodySchema,
        response: {
          200: successSchema(appointmentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    cancelAppointmentHandler,
  );
};

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  errorResponses,
  paginatedSchema,
  successSchema,
} from '../../common/validation/api-schemas.js';
import {
  archivePatientHandler,
  createPatientHandler,
  getPatientHandler,
  listPatientsHandler,
  restorePatientHandler,
  updatePatientHandler,
} from './patient.controller.js';
import {
  createPatientBodySchema,
  patientDtoSchema,
  patientIdParamSchema,
  patientListQuerySchema,
  updatePatientBodySchema,
} from './patient.schema.js';

/**
 * Mounted at `/api/v1/patients`.
 *
 * The clinic is resolved from the caller's membership (or the `x-clinic-id`
 * header when they work in several practices), so patient URLs stay clean and a
 * clinic id in the path can never be spoofed.
 */
export const patientRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_READ)],
      schema: {
        tags: ['patients'],
        summary: 'List patients in the current clinic',
        description: 'Defaults to ACTIVE patients. Search matches first name, last name or phone.',
        security: [{ bearerAuth: [] }],
        querystring: patientListQuerySchema,
        response: {
          200: paginatedSchema(patientDtoSchema),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    listPatientsHandler,
  );

  app.post(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_CREATE)],
      schema: {
        tags: ['patients'],
        summary: 'Create a patient',
        security: [{ bearerAuth: [] }],
        body: createPatientBodySchema,
        response: {
          201: successSchema(patientDtoSchema),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    createPatientHandler,
  );

  app.get(
    '/:patientId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_READ)],
      schema: {
        tags: ['patients'],
        summary: 'Get one patient',
        security: [{ bearerAuth: [] }],
        params: patientIdParamSchema,
        response: {
          200: successSchema(patientDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getPatientHandler,
  );

  app.patch(
    '/:patientId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_UPDATE)],
      schema: {
        tags: ['patients'],
        summary: 'Update a patient',
        security: [{ bearerAuth: [] }],
        params: patientIdParamSchema,
        body: updatePatientBodySchema,
        response: {
          200: successSchema(patientDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    updatePatientHandler,
  );

  app.post(
    '/:patientId/archive',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_ARCHIVE)],
      schema: {
        tags: ['patients'],
        summary: 'Archive a patient',
        description:
          'Patients are never deleted — treatments and cash records must keep resolving to a ' +
          'real person years after they leave the practice.',
        security: [{ bearerAuth: [] }],
        params: patientIdParamSchema,
        response: {
          200: successSchema(patientDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    archivePatientHandler,
  );

  app.post(
    '/:patientId/restore',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_ARCHIVE)],
      schema: {
        tags: ['patients'],
        summary: 'Restore an archived patient',
        security: [{ bearerAuth: [] }],
        params: patientIdParamSchema,
        response: {
          200: successSchema(patientDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    restorePatientHandler,
  );
};

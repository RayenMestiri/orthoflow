import multipart from '@fastify/multipart';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  errorResponses,
  paginatedSchema,
  successSchema,
} from '../../common/validation/api-schemas.js';
import {
  archivePatientMediaHandler,
  deletePatientMediaHandler,
  getPatientMediaHandler,
  listPatientMediaHandler,
  replacePatientMediaHandler,
  restorePatientMediaHandler,
  updatePatientMediaHandler,
  uploadPatientMediaHandler,
} from './patient-media.controller.js';
import {
  archivePatientMediaBodySchema,
  patientMediaDeleteResponseSchema,
  patientMediaDtoSchema,
  patientMediaIdParamSchema,
  patientMediaListQuerySchema,
  patientMediaPatientIdParamSchema,
  updatePatientMediaBodySchema,
} from './patient-media.schema.js';
import { PATIENT_MEDIA_MAX_UPLOAD_BYTES } from './patient-media.types.js';

export const patientMediaPatientRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(multipart, {
    limits: {
      fields: 8,
      files: 1,
      parts: 9,
      fieldSize: 2048,
      fileSize: PATIENT_MEDIA_MAX_UPLOAD_BYTES,
    },
  });
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/:patientId/media',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_MEDIA_READ)],
      schema: {
        tags: ['patient-media'],
        summary: 'List patient documents and media',
        security: [{ bearerAuth: [] }],
        params: patientMediaPatientIdParamSchema,
        querystring: patientMediaListQuerySchema,
        response: {
          200: paginatedSchema(patientMediaDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    listPatientMediaHandler,
  );

  app.post(
    '/:patientId/media/upload',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_MEDIA_MANAGE)],
      schema: {
        tags: ['patient-media'],
        summary: 'Upload one patient image or PDF',
        description:
          'Accepts multipart/form-data. JPEG, PNG and WebP are limited to 10 MB; PDF to 20 MB.',
        security: [{ bearerAuth: [] }],
        params: patientMediaPatientIdParamSchema,
        response: {
          201: successSchema(patientMediaDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422, 503),
        },
      },
    },
    uploadPatientMediaHandler,
  );
};

export const patientMediaRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(multipart, {
    limits: {
      fields: 8,
      files: 1,
      parts: 9,
      fieldSize: 2048,
      fileSize: PATIENT_MEDIA_MAX_UPLOAD_BYTES,
    },
  });
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/:mediaId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_MEDIA_READ)],
      schema: {
        tags: ['patient-media'],
        summary: 'Get patient media details',
        security: [{ bearerAuth: [] }],
        params: patientMediaIdParamSchema,
        response: {
          200: successSchema(patientMediaDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getPatientMediaHandler,
  );

  app.patch(
    '/:mediaId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_MEDIA_MANAGE)],
      schema: {
        tags: ['patient-media'],
        summary: 'Update patient media metadata',
        security: [{ bearerAuth: [] }],
        params: patientMediaIdParamSchema,
        body: updatePatientMediaBodySchema,
        response: {
          200: successSchema(patientMediaDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    updatePatientMediaHandler,
  );

  app.post(
    '/:mediaId/archive',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_MEDIA_MANAGE)],
      schema: {
        tags: ['patient-media'],
        summary: 'Archive patient media without deleting its binary',
        security: [{ bearerAuth: [] }],
        params: patientMediaIdParamSchema,
        body: archivePatientMediaBodySchema,
        response: {
          200: successSchema(patientMediaDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    archivePatientMediaHandler,
  );

  app.post(
    '/:mediaId/restore',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_MEDIA_MANAGE)],
      schema: {
        tags: ['patient-media'],
        summary: 'Restore an archived patient file',
        security: [{ bearerAuth: [] }],
        params: patientMediaIdParamSchema,
        response: {
          200: successSchema(patientMediaDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    restorePatientMediaHandler,
  );

  // POST /:mediaId/replace — swap the binary while keeping metadata
  app.post(
    '/:mediaId/replace',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_MEDIA_MANAGE)],
      schema: {
        tags: ['patient-media'],
        summary: 'Replace the file binary of an existing media record',
        description:
          'Uploads a new image or PDF, replaces the stored binary, and removes the old Cloudinary asset. Metadata is unchanged.',
        security: [{ bearerAuth: [] }],
        params: patientMediaIdParamSchema,
        response: {
          200: successSchema(patientMediaDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422, 503),
        },
      },
    },
    replacePatientMediaHandler,
  );

  // DELETE /:mediaId — permanently delete file from database and Cloudinary storage
  app.delete(
    '/:mediaId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.PATIENT_MEDIA_MANAGE)],
      schema: {
        tags: ['patient-media'],
        summary: 'Permanently delete patient media',
        description: 'Permanently removes the document/photo and deletes its asset from cloud storage.',
        security: [{ bearerAuth: [] }],
        params: patientMediaIdParamSchema,
        response: {
          200: successSchema(patientMediaDeleteResponseSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    deletePatientMediaHandler,
  );
};

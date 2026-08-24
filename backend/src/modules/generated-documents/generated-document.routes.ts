import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  errorResponses,
  paginatedSchema,
  successSchema,
} from '../../common/validation/api-schemas.js';
import {
  artifactGenerationRateLimitConfig,
  protectedDownloadRateLimitConfig,
} from '../../plugins/security.plugin.js';
import {
  activateDocumentTemplateHandler,
  archiveDocumentTemplateHandler,
  createDocumentTemplateHandler,
  createDocumentTemplateVersionHandler,
  downloadGeneratedDocumentPdfHandler,
  finalizeGeneratedDocumentHandler,
  getGeneratedDocumentHandler,
  listDocumentTemplatesHandler,
  listPatientGeneratedDocumentsHandler,
  previewGeneratedDocumentHandler,
  updateDocumentTemplateHandler,
  voidGeneratedDocumentHandler,
} from './generated-document.controller.js';
import {
  createDocumentTemplateBodySchema,
  createDocumentTemplateVersionBodySchema,
  documentTemplateDtoSchema,
  documentTemplateIdParamSchema,
  documentTemplateListQuerySchema,
  finalizeGeneratedDocumentBodySchema,
  generatedDocumentDtoSchema,
  generatedDocumentIdParamSchema,
  generatedDocumentListQuerySchema,
  generatedDocumentPatientIdParamSchema,
  generatedDocumentPreviewDtoSchema,
  generatedDocumentReasonBodySchema,
  previewGeneratedDocumentBodySchema,
  updateDocumentTemplateBodySchema,
} from './generated-document.schema.js';

export const documentTemplateRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  app.get(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GENERATED_DOCUMENT_READ)],
      schema: {
        tags: ['document-templates'],
        summary: 'List clinic document template versions',
        security: [{ bearerAuth: [] }],
        querystring: documentTemplateListQuerySchema,
        response: {
          200: paginatedSchema(documentTemplateDtoSchema),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    listDocumentTemplatesHandler,
  );
  app.post(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.DOCUMENT_TEMPLATE_MANAGE)],
      schema: {
        tags: ['document-templates'],
        summary: 'Create a safe structured document template',
        security: [{ bearerAuth: [] }],
        body: createDocumentTemplateBodySchema,
        response: {
          201: successSchema(documentTemplateDtoSchema),
          ...errorResponses(400, 401, 403, 409, 422),
        },
      },
    },
    createDocumentTemplateHandler,
  );
  app.patch(
    '/:templateId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.DOCUMENT_TEMPLATE_MANAGE)],
      schema: {
        tags: ['document-templates'],
        summary: 'Edit a draft document template',
        security: [{ bearerAuth: [] }],
        params: documentTemplateIdParamSchema,
        body: updateDocumentTemplateBodySchema,
        response: {
          200: successSchema(documentTemplateDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    updateDocumentTemplateHandler,
  );
  app.post(
    '/:templateId/versions',
    {
      preHandler: [app.requirePermission(PERMISSIONS.DOCUMENT_TEMPLATE_MANAGE)],
      schema: {
        tags: ['document-templates'],
        summary: 'Create a new draft template version',
        security: [{ bearerAuth: [] }],
        params: documentTemplateIdParamSchema,
        body: createDocumentTemplateVersionBodySchema,
        response: {
          201: successSchema(documentTemplateDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    createDocumentTemplateVersionHandler,
  );
  app.post(
    '/:templateId/activate',
    {
      preHandler: [app.requirePermission(PERMISSIONS.DOCUMENT_TEMPLATE_MANAGE)],
      schema: {
        tags: ['document-templates'],
        summary: 'Activate an immutable document template version',
        security: [{ bearerAuth: [] }],
        params: documentTemplateIdParamSchema,
        response: {
          200: successSchema(documentTemplateDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    activateDocumentTemplateHandler,
  );
  app.post(
    '/:templateId/archive',
    {
      preHandler: [app.requirePermission(PERMISSIONS.DOCUMENT_TEMPLATE_MANAGE)],
      schema: {
        tags: ['document-templates'],
        summary: 'Archive a document template version',
        security: [{ bearerAuth: [] }],
        params: documentTemplateIdParamSchema,
        response: {
          200: successSchema(documentTemplateDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409),
        },
      },
    },
    archiveDocumentTemplateHandler,
  );
};

export const patientGeneratedDocumentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  app.get(
    '/:patientId/generated-documents',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GENERATED_DOCUMENT_READ)],
      schema: {
        tags: ['generated-documents'],
        summary: 'List finalized documents for a patient',
        security: [{ bearerAuth: [] }],
        params: generatedDocumentPatientIdParamSchema,
        querystring: generatedDocumentListQuerySchema,
        response: {
          200: paginatedSchema(generatedDocumentDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    listPatientGeneratedDocumentsHandler,
  );
  app.post(
    '/:patientId/generated-documents/preview',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GENERATED_DOCUMENT_READ)],
      schema: {
        tags: ['generated-documents'],
        summary: 'Resolve an authoritative document preview',
        security: [{ bearerAuth: [] }],
        params: generatedDocumentPatientIdParamSchema,
        body: previewGeneratedDocumentBodySchema,
        response: {
          200: successSchema(generatedDocumentPreviewDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    previewGeneratedDocumentHandler,
  );
  app.post(
    '/:patientId/generated-documents',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GENERATED_DOCUMENT_READ)],
      config: artifactGenerationRateLimitConfig,
      schema: {
        tags: ['generated-documents'],
        summary: 'Finalize, snapshot and securely store a PDF document',
        security: [{ bearerAuth: [] }],
        params: generatedDocumentPatientIdParamSchema,
        body: finalizeGeneratedDocumentBodySchema,
        response: {
          201: successSchema(generatedDocumentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422, 503),
        },
      },
    },
    finalizeGeneratedDocumentHandler,
  );
};

export const generatedDocumentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  app.get(
    '/:documentId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GENERATED_DOCUMENT_READ)],
      schema: {
        tags: ['generated-documents'],
        summary: 'Get immutable generated document metadata',
        security: [{ bearerAuth: [] }],
        params: generatedDocumentIdParamSchema,
        response: {
          200: successSchema(generatedDocumentDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getGeneratedDocumentHandler,
  );
  app.get(
    '/:documentId/pdf',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GENERATED_DOCUMENT_READ)],
      config: protectedDownloadRateLimitConfig,
      schema: {
        tags: ['generated-documents'],
        summary: 'Stream an integrity-checked generated PDF',
        security: [{ bearerAuth: [] }],
        params: generatedDocumentIdParamSchema,
        response: { ...errorResponses(400, 401, 403, 404, 503) },
      },
    },
    downloadGeneratedDocumentPdfHandler,
  );
  app.post(
    '/:documentId/void',
    {
      preHandler: [app.requirePermission(PERMISSIONS.GENERATED_DOCUMENT_VOID)],
      schema: {
        tags: ['generated-documents'],
        summary: 'Void a finalized document without deleting its artifact',
        security: [{ bearerAuth: [] }],
        params: generatedDocumentIdParamSchema,
        body: generatedDocumentReasonBodySchema,
        response: {
          200: successSchema(generatedDocumentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409),
        },
      },
    },
    voidGeneratedDocumentHandler,
  );
};

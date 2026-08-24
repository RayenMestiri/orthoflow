import multipart from '@fastify/multipart';
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
  activateConsentTemplateHandler,
  archiveConsentTemplateHandler,
  createConsentTemplateHandler,
  createConsentTemplateVersionHandler,
  downloadConsentPdfHandler,
  getConsentHandler,
  listConsentTemplatesHandler,
  listPatientConsentsHandler,
  previewPatientConsentHandler,
  revokeConsentHandler,
  signPatientConsentHandler,
  updateConsentTemplateHandler,
  voidConsentHandler,
} from './consent.controller.js';
import {
  consentIdParamSchema,
  consentListQuerySchema,
  consentPatientIdParamSchema,
  consentPreviewBodySchema,
  consentPreviewDtoSchema,
  consentReasonBodySchema,
  consentTemplateDtoSchema,
  consentTemplateIdParamSchema,
  consentTemplateListQuerySchema,
  createConsentTemplateBodySchema,
  createConsentTemplateVersionBodySchema,
  signedConsentDtoSchema,
  updateConsentTemplateBodySchema,
} from './consent.schema.js';
import { CONSENT_SIGNATURE_MAX_BYTES } from './consent.validation.js';

export const consentTemplateRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CONSENT_READ)],
      schema: {
        tags: ['consent-templates'],
        summary: 'List clinic consent template versions',
        security: [{ bearerAuth: [] }],
        querystring: consentTemplateListQuerySchema,
        response: {
          200: paginatedSchema(consentTemplateDtoSchema),
          ...errorResponses(400, 401, 403),
        },
      },
    },
    listConsentTemplatesHandler,
  );
  app.post(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CONSENT_TEMPLATE_MANAGE)],
      schema: {
        tags: ['consent-templates'],
        summary: 'Create a draft consent template',
        security: [{ bearerAuth: [] }],
        body: createConsentTemplateBodySchema,
        response: {
          201: successSchema(consentTemplateDtoSchema),
          ...errorResponses(400, 401, 403, 409),
        },
      },
    },
    createConsentTemplateHandler,
  );
  app.patch(
    '/:templateId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CONSENT_TEMPLATE_MANAGE)],
      schema: {
        tags: ['consent-templates'],
        summary: 'Edit a draft consent template version',
        security: [{ bearerAuth: [] }],
        params: consentTemplateIdParamSchema,
        body: updateConsentTemplateBodySchema,
        response: {
          200: successSchema(consentTemplateDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    updateConsentTemplateHandler,
  );
  app.post(
    '/:templateId/versions',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CONSENT_TEMPLATE_MANAGE)],
      schema: {
        tags: ['consent-templates'],
        summary: 'Create the next draft version from an existing template',
        security: [{ bearerAuth: [] }],
        params: consentTemplateIdParamSchema,
        body: createConsentTemplateVersionBodySchema,
        response: {
          201: successSchema(consentTemplateDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409),
        },
      },
    },
    createConsentTemplateVersionHandler,
  );
  app.post(
    '/:templateId/activate',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CONSENT_TEMPLATE_MANAGE)],
      schema: {
        tags: ['consent-templates'],
        summary: 'Activate one immutable template version',
        security: [{ bearerAuth: [] }],
        params: consentTemplateIdParamSchema,
        response: {
          200: successSchema(consentTemplateDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    activateConsentTemplateHandler,
  );
  app.post(
    '/:templateId/archive',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CONSENT_TEMPLATE_MANAGE)],
      schema: {
        tags: ['consent-templates'],
        summary: 'Archive a template version without deleting history',
        security: [{ bearerAuth: [] }],
        params: consentTemplateIdParamSchema,
        response: {
          200: successSchema(consentTemplateDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    archiveConsentTemplateHandler,
  );
};

export const patientConsentRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(multipart, {
    limits: {
      fields: 8,
      files: 1,
      parts: 9,
      fieldSize: 25_000,
      fileSize: CONSENT_SIGNATURE_MAX_BYTES,
    },
  });
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  app.get(
    '/:patientId/consents',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CONSENT_READ)],
      schema: {
        tags: ['consents'],
        summary: 'List signed consents for one patient',
        security: [{ bearerAuth: [] }],
        params: consentPatientIdParamSchema,
        querystring: consentListQuerySchema,
        response: {
          200: paginatedSchema(signedConsentDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    listPatientConsentsHandler,
  );
  app.post(
    '/:patientId/consents/preview',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CONSENT_CAPTURE)],
      schema: {
        tags: ['consents'],
        summary: 'Resolve the exact consent document that will be shown',
        security: [{ bearerAuth: [] }],
        params: consentPatientIdParamSchema,
        body: consentPreviewBodySchema,
        response: {
          200: successSchema(consentPreviewDtoSchema),
          ...errorResponses(400, 401, 403, 404, 422),
        },
      },
    },
    previewPatientConsentHandler,
  );
  app.post(
    '/:patientId/consents/sign',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CONSENT_CAPTURE)],
      config: artifactGenerationRateLimitConfig,
      schema: {
        tags: ['consents'],
        summary: 'Finalize a signed consent from a PNG signature upload',
        description: 'Accepts multipart/form-data; signature bytes are never stored in MongoDB.',
        security: [{ bearerAuth: [] }],
        params: consentPatientIdParamSchema,
        response: {
          201: successSchema(signedConsentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422, 503),
        },
      },
    },
    signPatientConsentHandler,
  );
};

export const consentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  app.get(
    '/:consentId',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CONSENT_READ)],
      schema: {
        tags: ['consents'],
        summary: 'Get immutable signed-consent metadata and snapshot',
        security: [{ bearerAuth: [] }],
        params: consentIdParamSchema,
        response: {
          200: successSchema(signedConsentDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    getConsentHandler,
  );
  app.get(
    '/:consentId/pdf',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CONSENT_READ)],
      config: protectedDownloadRateLimitConfig,
      schema: {
        tags: ['consents'],
        summary: 'Stream the integrity-checked finalized consent PDF',
        security: [{ bearerAuth: [] }],
        params: consentIdParamSchema,
        response: { ...errorResponses(400, 401, 403, 404, 503) },
      },
    },
    downloadConsentPdfHandler,
  );
  app.post(
    '/:consentId/revoke',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CONSENT_REVOKE)],
      schema: {
        tags: ['consents'],
        summary: 'Record withdrawal of a valid signed consent',
        security: [{ bearerAuth: [] }],
        params: consentIdParamSchema,
        body: consentReasonBodySchema,
        response: {
          200: successSchema(signedConsentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    revokeConsentHandler,
  );
  app.post(
    '/:consentId/void',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CONSENT_VOID)],
      schema: {
        tags: ['consents'],
        summary: 'Void an invalid consent while preserving its original PDF',
        security: [{ bearerAuth: [] }],
        params: consentIdParamSchema,
        body: consentReasonBodySchema,
        response: {
          200: successSchema(signedConsentDtoSchema),
          ...errorResponses(400, 401, 403, 404, 409, 422),
        },
      },
    },
    voidConsentHandler,
  );
};

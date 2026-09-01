import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  downloadPortalConsentHandler,
  downloadPortalDocumentHandler,
  getPortalAccessStatusHandler,
  getPortalChildOverviewHandler,
  getPortalDashboardHandler,
  getPortalFinanceHandler,
  getPortalReceiptHandler,
  invitePortalAccessHandler,
  listAllPortalConsentsHandler,
  listPortalAppointmentsHandler,
  listPortalChildrenHandler,
  listPortalConsentsHandler,
  listPortalDocumentsHandler,
  revokePortalAccessHandler,
  revokePortalDocumentHandler,
  sharePortalDocumentHandler,
} from './portal.controller.js';
import {
  portalChildParamSchema,
  portalConsentParamSchema,
  portalDocumentParamSchema,
  portalGuardianParamSchema,
  portalReceiptParamSchema,
  portalRevokeBodySchema,
  portalShareBodySchema,
} from './portal.schema.js';
import { z } from 'zod';
import { objectIdSchema } from '../../common/validation/common.schemas.js';

export const portalRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticatePortal);
  app.get('/dashboard', { schema: { tags: ['portal'] } }, getPortalDashboardHandler);
  app.get('/children', { schema: { tags: ['portal'] } }, listPortalChildrenHandler);
  app.get('/consents', { schema: { tags: ['portal'] } }, listAllPortalConsentsHandler);
  app.get(
    '/children/:patientId/overview',
    { schema: { tags: ['portal'], params: portalChildParamSchema } },
    getPortalChildOverviewHandler,
  );
  app.get('/appointments', { schema: { tags: ['portal'] } }, listPortalAppointmentsHandler);
  app.get(
    '/children/:patientId/finance',
    { schema: { tags: ['portal'], params: portalChildParamSchema } },
    getPortalFinanceHandler,
  );
  app.get(
    '/children/:patientId/receipts/:receiptId',
    { schema: { tags: ['portal'], params: portalReceiptParamSchema } },
    getPortalReceiptHandler,
  );
  app.get('/documents', { schema: { tags: ['portal'] } }, listPortalDocumentsHandler);
  app.get(
    '/children/:patientId/documents/:documentId/pdf',
    { schema: { tags: ['portal'], params: portalDocumentParamSchema } },
    downloadPortalDocumentHandler,
  );
  app.get(
    '/children/:patientId/consents',
    { schema: { tags: ['portal'], params: portalChildParamSchema } },
    listPortalConsentsHandler,
  );
  app.get(
    '/children/:patientId/consents/:consentId/pdf',
    { schema: { tags: ['portal'], params: portalConsentParamSchema } },
    downloadPortalConsentHandler,
  );
};

export const portalManagementRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  const permission = app.requirePermission(PERMISSIONS.PORTAL_ACCESS_MANAGE);
  app.get(
    '/guardians/:guardianId',
    {
      preHandler: [permission],
      schema: { tags: ['portal-management'], params: portalGuardianParamSchema },
    },
    getPortalAccessStatusHandler,
  );
  app.post(
    '/guardians/:guardianId/invite',
    {
      preHandler: [permission],
      schema: { tags: ['portal-management'], params: portalGuardianParamSchema },
    },
    invitePortalAccessHandler,
  );
  app.post(
    '/guardians/:guardianId/revoke',
    {
      preHandler: [permission],
      schema: {
        tags: ['portal-management'],
        params: portalGuardianParamSchema,
        body: portalRevokeBodySchema,
      },
    },
    revokePortalAccessHandler,
  );
  app.post(
    '/documents/:documentId/share',
    {
      preHandler: [permission],
      schema: {
        tags: ['portal-management'],
        params: z.object({ documentId: objectIdSchema }),
        body: portalShareBodySchema,
      },
    },
    sharePortalDocumentHandler,
  );
  app.delete(
    '/documents/:documentId/share/:guardianId',
    {
      preHandler: [permission],
      schema: {
        tags: ['portal-management'],
        params: z.object({ documentId: objectIdSchema, guardianId: objectIdSchema }),
      },
    },
    revokePortalDocumentHandler,
  );
};

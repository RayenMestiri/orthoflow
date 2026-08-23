import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authRateLimitConfig } from '../../plugins/security.plugin.js';
import {
  activatePortalHandler,
  loginPortalHandler,
  logoutPortalHandler,
  portalMeHandler,
  refreshPortalHandler,
} from './portal-auth.controller.js';
import {
  portalActivateBodySchema,
  portalLoginBodySchema,
  portalLogoutBodySchema,
  portalRefreshBodySchema,
} from './portal.schema.js';

export const portalAuthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/activate',
    {
      config: authRateLimitConfig,
      schema: { tags: ['portal-auth'], body: portalActivateBodySchema },
    },
    activatePortalHandler,
  );
  app.post(
    '/login',
    { config: authRateLimitConfig, schema: { tags: ['portal-auth'], body: portalLoginBodySchema } },
    loginPortalHandler,
  );
  app.post(
    '/refresh',
    {
      config: authRateLimitConfig,
      schema: { tags: ['portal-auth'], body: portalRefreshBodySchema },
    },
    refreshPortalHandler,
  );
  app.post(
    '/logout',
    {
      preHandler: [app.authenticatePortal],
      schema: { tags: ['portal-auth'], body: portalLogoutBodySchema },
    },
    logoutPortalHandler,
  );
  app.get(
    '/me',
    { preHandler: [app.authenticatePortal], schema: { tags: ['portal-auth'] } },
    portalMeHandler,
  );
};

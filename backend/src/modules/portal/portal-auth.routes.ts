import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authRateLimitConfig } from '../../plugins/security.plugin.js';
import {
  activatePortalHandler,
  loginPortalHandler,
  logoutPortalHandler,
  portalForgotPasswordHandler,
  portalMeHandler,
  portalResetPasswordHandler,
  refreshPortalHandler,
} from './portal-auth.controller.js';
import {
  portalActivateBodySchema,
  portalForgotPasswordBodySchema,
  portalLoginBodySchema,
  portalLogoutBodySchema,
  portalRefreshBodySchema,
  portalResetPasswordBodySchema,
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
    '/forgot-password',
    {
      config: authRateLimitConfig,
      schema: { tags: ['portal-auth'], body: portalForgotPasswordBodySchema },
    },
    portalForgotPasswordHandler,
  );
  app.post(
    '/reset-password',
    {
      config: authRateLimitConfig,
      schema: { tags: ['portal-auth'], body: portalResetPasswordBodySchema },
    },
    portalResetPasswordHandler,
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

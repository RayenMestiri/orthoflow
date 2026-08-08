import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses } from '../../common/validation/api-schemas.js';
import { authRateLimitConfig } from '../../plugins/security.plugin.js';
import {
  currentUserHandler,
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
  registerHandler,
  resendVerificationHandler,
  resetPasswordHandler,
  verifyEmailHandler,
} from './auth.controller.js';
import {
  acceptedResponseSchema,
  currentUserResponseSchema,
  emailActionBodySchema,
  loginBodySchema,
  loginResponseSchema,
  logoutBodySchema,
  logoutResponseSchema,
  refreshBodySchema,
  refreshResponseSchema,
  registerBodySchema,
  registerResponseSchema,
  resetPasswordBodySchema,
  resetPasswordResponseSchema,
  verifyEmailBodySchema,
  verifyEmailResponseSchema,
} from './auth.schema.js';

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/register',
    {
      config: authRateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Register a clinic and its owner',
        description:
          'Creates the person, their clinic and the CLINIC_OWNER membership in a single ' +
          'transaction, then signs them in. This is the only endpoint that creates a clinic.',
        body: registerBodySchema,
        response: {
          201: registerResponseSchema,
          ...errorResponses(400, 409, 429),
        },
      },
    },
    registerHandler,
  );

  app.post(
    '/login',
    {
      config: authRateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Sign in with email and password',
        body: loginBodySchema,
        response: {
          200: loginResponseSchema,
          ...errorResponses(400, 401, 403, 429),
        },
      },
    },
    loginHandler,
  );

  app.post(
    '/refresh',
    {
      config: authRateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Exchange a refresh token for a new token pair',
        description:
          'Rotates the refresh token. Presenting a token that was already rotated away ' +
          'revokes every session in that family — treat it as a stolen credential.',
        body: refreshBodySchema,
        response: {
          200: refreshResponseSchema,
          ...errorResponses(400, 401, 429),
        },
      },
    },
    refreshHandler,
  );

  app.post(
    '/logout',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['auth'],
        summary: 'Revoke the current session (or every session)',
        security: [{ bearerAuth: [] }],
        body: logoutBodySchema,
        response: {
          200: logoutResponseSchema,
          ...errorResponses(401),
        },
      },
    },
    logoutHandler,
  );

  app.get(
    '/me',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['auth'],
        summary: 'Current user and clinic memberships',
        security: [{ bearerAuth: [] }],
        response: {
          200: currentUserResponseSchema,
          ...errorResponses(401),
        },
      },
    },
    currentUserHandler,
  );

  app.post(
    '/verify-email',
    {
      config: authRateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Verify an email address with a six-digit code',
        body: verifyEmailBodySchema,
        response: {
          200: verifyEmailResponseSchema,
          ...errorResponses(400, 429),
        },
      },
    },
    verifyEmailHandler,
  );

  app.post(
    '/resend-verification',
    {
      config: authRateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Request another email verification code',
        description: 'Always returns the same response so account existence is not disclosed.',
        body: emailActionBodySchema,
        response: {
          202: acceptedResponseSchema,
          ...errorResponses(400, 429),
        },
      },
    },
    resendVerificationHandler,
  );

  app.post(
    '/forgot-password',
    {
      config: authRateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Request a password reset code',
        description: 'Always returns the same response so account existence is not disclosed.',
        body: emailActionBodySchema,
        response: {
          202: acceptedResponseSchema,
          ...errorResponses(400, 429),
        },
      },
    },
    forgotPasswordHandler,
  );

  app.post(
    '/reset-password',
    {
      config: authRateLimitConfig,
      schema: {
        tags: ['auth'],
        summary: 'Reset a password with a six-digit code',
        body: resetPasswordBodySchema,
        response: {
          200: resetPasswordResponseSchema,
          ...errorResponses(400, 429),
        },
      },
    },
    resetPasswordHandler,
  );
};

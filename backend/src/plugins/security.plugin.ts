import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { corsOrigins, env, isProduction, isSwaggerEnabled } from '../config/env.js';

/**
 * Baseline HTTP hardening: headers, origins, cookies and rate limits.
 *
 * The rate limiter uses the in-process store, which is correct for a single
 * instance and becomes wrong the moment the API is scaled horizontally. Swapping
 * in the Redis store is a one-line change here and touches nothing else — that
 * is the whole reason limits are configured in one plugin.
 */
export const securityPlugin = fp(
  async (app) => {
    await app.register(helmet, {
      // Swagger UI needs inline styles/scripts; the API itself serves no HTML.
      contentSecurityPolicy: isSwaggerEnabled ? false : undefined,
      crossOriginEmbedderPolicy: false,
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    });

    await app.register(cors, {
      origin: [...corsOrigins, /\.vercel\.app$/],
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-clinic-id'],
      maxAge: 86_400,
    });

    await app.register(cookie, {
      secret: env.JWT_REFRESH_SECRET,
      parseOptions: {},
    });

    await app.register(rateLimit, {
      global: true,
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW,
      /**
       * Keyed on IP: the limiter runs at `onRequest`, before authentication,
       * so no user identity exists yet. Everyone behind one clinic's NAT
       * therefore shares a budget — which is why the global limit is generous
       * and the credential endpoints get their own tighter one below.
       */
      keyGenerator: (request) => request.ip,
      allowList: (request) => request.url.startsWith('/health') || request.url.includes('/health'),
    });
  },
  { name: 'security-plugin' },
);

/**
 * Tight limit for credential endpoints, applied per route.
 * Login and refresh are the endpoints worth brute-forcing, so they get their own
 * much smaller budget keyed on IP.
 */
export const authRateLimitConfig = {
  rateLimit: {
    max: env.AUTH_RATE_LIMIT_MAX,
    timeWindow: env.AUTH_RATE_LIMIT_WINDOW,
  },
} as const;

/** CPU/storage-heavy commands get a separate budget from ordinary clinic reads. */
export const artifactGenerationRateLimitConfig = {
  rateLimit: { max: 15, timeWindow: '1 minute' },
} as const;

/** Protected binary reads are bounded without impeding normal document review. */
export const protectedDownloadRateLimitConfig = {
  rateLimit: { max: 60, timeWindow: '1 minute' },
} as const;

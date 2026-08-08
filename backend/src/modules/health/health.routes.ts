import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { getDatabaseState, pingDatabase } from '../../infrastructure/database/connection.js';

const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  timestamp: z.string(),
  environment: z.string(),
  uptimeSeconds: z.number(),
});

const readinessResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  timestamp: z.string(),
  checks: z.object({
    database: z.object({
      state: z.string(),
      reachable: z.boolean(),
    }),
  }),
});

/**
 * Unauthenticated probes.
 *
 * They report *whether* a dependency answers, never anything about it: no host
 * names, no versions, no connection strings. `/health` is for load balancers,
 * `/health/ready` for orchestrators deciding whether to send traffic.
 */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness probe',
        response: { 200: healthResponseSchema },
      },
    },
    async (_request, reply) => {
      return reply.send({
        status: 'ok' as const,
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
        uptimeSeconds: Math.round(process.uptime()),
      });
    },
  );

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        summary: 'Readiness probe including database connectivity',
        response: { 200: readinessResponseSchema, 503: readinessResponseSchema },
      },
    },
    async (_request, reply) => {
      const reachable = await pingDatabase();
      const body = {
        status: reachable ? ('ok' as const) : ('degraded' as const),
        timestamp: new Date().toISOString(),
        checks: {
          database: { state: getDatabaseState(), reachable },
        },
      };

      return reply.status(reachable ? 200 : 503).send(body);
    },
  );
};

import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env, isProduction } from './config/env.js';
import { loggerOptions } from './config/logger.js';
import { authPlugin } from './plugins/auth.plugin.js';
import { portalAuthPlugin } from './plugins/portal-auth.plugin.js';
import { databasePlugin } from './plugins/database.plugin.js';
import { errorHandlerPlugin } from './plugins/error-handler.plugin.js';
import { securityPlugin } from './plugins/security.plugin.js';
import { swaggerPlugin } from './plugins/swagger.plugin.js';
import { notificationWorkerPlugin } from './plugins/notification-worker.plugin.js';
import { documentRetentionPlugin } from './plugins/document-retention.plugin.js';
import { registerModules } from './modules/index.js';

export interface BuildAppOptions {
  /**
   * Connect to MongoDB during boot. Tests that exercise HTTP behaviour with
   * mocked repositories turn this off so they need no database.
   */
  withDatabase?: boolean;
}

/**
 * Composes the HTTP application.
 *
 * Order matters and is deliberate:
 *   1. Zod compilers — so every later route validates and serializes with Zod.
 *   2. Error handler — installed before anything can throw.
 *   3. Security      — headers, CORS, cookies and rate limits wrap everything.
 *   4. Database      — fail the boot, not the first patient lookup.
 *   5. Auth          — decorates the guards that routes depend on.
 *   6. Swagger       — must be registered before the routes it documents.
 *   7. Modules       — the API itself.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    pluginTimeout: 30_000,
    /**
     * Behind a load balancer, `request.ip` is the proxy unless we trust it —
     * which would make both rate limiting and audit trails describe the wrong
     * client.
     */
    trustProxy:
      isProduction && env.TRUST_PROXY_HOPS > 0
        ? (_address: string, hop: number) => hop < env.TRUST_PROXY_HOPS
        : false,
    bodyLimit: env.BODY_LIMIT_BYTES,
    genReqId: () => randomUUID(),
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  app.addHook('onResponse', async (request, reply) => {
    if (reply.elapsedTime >= env.SLOW_REQUEST_THRESHOLD_MS) {
      request.log.warn(
        {
          route: request.routeOptions.url,
          method: request.method,
          statusCode: reply.statusCode,
          durationMs: Math.round(reply.elapsedTime),
        },
        'Slow HTTP request',
      );
    }
  });

  /**
   * Treat an empty `application/json` body as `{}`.
   *
   * Action endpoints (`POST /patients/:id/archive`, `POST /auth/logout`) carry no
   * payload, but browser HTTP clients still send the JSON content type. Fastify's
   * default parser rejects that combination with a 400 before routing, so a
   * correct request would fail for a reason the caller cannot see. Every body in
   * this API is a JSON object, so an empty one is `{}` — and the route's own Zod
   * schema still decides which fields are required. Malformed JSON stays a 400.
   */
  app.addContentTypeParser<string>(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      if (body.length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body));
      } catch {
        const error = Object.assign(new Error('Body is not valid JSON'), { statusCode: 400 });
        done(error, undefined);
      }
    },
  );

  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin);

  if (options.withDatabase ?? true) {
    await app.register(databasePlugin);
    await app.register(notificationWorkerPlugin);
    await app.register(documentRetentionPlugin);
  }

  await app.register(authPlugin);
  await app.register(portalAuthPlugin);
  await app.register(swaggerPlugin);
  await app.withTypeProvider<ZodTypeProvider>().register(registerModules);

  await app.ready();
  return app;
}

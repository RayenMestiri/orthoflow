import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { env, isSwaggerEnabled } from '../config/env.js';
import { CLINIC_HEADER } from '../common/constants/api.js';

/**
 * OpenAPI 3.1 documentation generated from the same Zod schemas that validate
 * requests at runtime — the docs cannot drift from the implementation because
 * there is only one definition.
 *
 * Never served in production (see `isSwaggerEnabled`).
 */
export const swaggerPlugin = fp(
  async (app) => {
    if (!isSwaggerEnabled) {
      return;
    }

    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: 'OrthoFlow API',
          description:
            'Practice-management API for orthodontic and dental clinics.\n\n' +
            '**Tenancy** — every business resource belongs to exactly one clinic. ' +
            `Callers who belong to more than one clinic must send the \`${CLINIC_HEADER}\` ` +
            'header; the server always verifies the membership behind it.',
          version: '0.1.0',
        },
        servers: [{ url: `http://localhost:${env.PORT}`, description: 'Local development' }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'Access token returned by `POST /api/v1/auth/login`.',
            },
          },
        },
        tags: [
          { name: 'health', description: 'Liveness and readiness' },
          { name: 'auth', description: 'Registration, sign-in and sessions' },
          { name: 'clinics', description: 'Clinic profile' },
          { name: 'memberships', description: 'Clinic staff and their roles' },
          { name: 'patients', description: 'Patient records' },
          { name: 'audit-logs', description: 'Immutable trail of business events' },
        ],
      },
      transform: jsonSchemaTransform,
    });

    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true, persistAuthorization: true },
    });
  },
  { name: 'swagger-plugin' },
);

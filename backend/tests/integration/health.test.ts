import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ withDatabase: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports liveness without authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', environment: 'test' });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('leaks nothing about the infrastructure', async () => {
    const body = response(await app.inject({ method: 'GET', url: '/health' }));

    expect(body).not.toMatch(/mongodb|cloudinary|secret|password/i);
  });

  it('reports 503 from the readiness probe when the database is unreachable', async () => {
    const result = await app.inject({ method: 'GET', url: '/health/ready' });

    // No database is connected in this test app, which is exactly the
    // "do not send me traffic" case the probe exists to signal.
    expect(result.statusCode).toBe(503);
    expect(result.json()).toMatchObject({
      status: 'degraded',
      checks: { database: { reachable: false } },
    });
  });

  it('answers the standard error envelope for an unknown route', async () => {
    const result = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });

    expect(result.statusCode).toBe(404);
    expect(result.json()).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND', details: { requestId: result.headers['x-request-id'] } },
    });
  });

  it('requires authentication for patient-media deletion route', async () => {
    const result = await app.inject({
      method: 'DELETE',
      url: '/api/v1/patient-media/652f1c9b8a1e4f0012ab0001',
    });

    expect(result.statusCode).toBe(401);
  });
});

function response(result: { payload: string }): string {
  return result.payload;
}

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { createTestApp } from '../helpers/test-app.js';

vi.mock('../../src/modules/users/user.repository.js', async () => ({
  userRepository: (await import('../helpers/repository-mocks.js')).userRepositoryMock,
}));
vi.mock('../../src/modules/auth/auth-session.repository.js', async () => ({
  authSessionRepository: (await import('../helpers/repository-mocks.js')).authSessionRepositoryMock,
}));
vi.mock('../../src/modules/memberships/membership.repository.js', async () => ({
  membershipRepository: (await import('../helpers/repository-mocks.js')).membershipRepositoryMock,
}));
vi.mock('../../src/modules/clinics/clinic.repository.js', async () => ({
  clinicRepository: (await import('../helpers/repository-mocks.js')).clinicRepositoryMock,
}));

/**
 * Login is the endpoint worth brute-forcing, so it has a much smaller budget
 * than the rest of the API. This test exists because a per-route rate limit that
 * silently fails to register looks exactly like one that works.
 *
 * Its own app instance: the limiter keeps per-key counters, which would leak
 * into unrelated tests.
 */
describe('credential endpoint rate limiting', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('cuts off repeated login attempts from one address', async () => {
    const attempts = env.AUTH_RATE_LIMIT_MAX + 2;
    const statuses: number[] = [];

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'attacker@example.com', password: 'guess-number-1' },
      });
      statuses.push(response.statusCode);
    }

    // Unknown account, so every allowed attempt is a 401 — until the limiter
    // steps in. It must trigger well before the generous global budget.
    expect(statuses.filter((status) => status === 401).length).toBe(env.AUTH_RATE_LIMIT_MAX);
    expect(statuses.at(-1)).toBe(429);
  });

  it('answers a throttled request with the standard error envelope', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'attacker@example.com', password: 'guess-number-2' },
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('leaves the health probe unthrottled', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
  });
});

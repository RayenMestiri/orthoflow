import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authSessionRepositoryMock,
  CLINIC_A,
  resetRepositoryMocks,
  resetTestState,
  testState,
  USER_ID,
} from '../helpers/repository-mocks.js';
import { authHeader, createTestApp } from '../helpers/test-app.js';

// Hoisted above every import: the app under test wires itself to these fakes
// instead of the real Mongoose repositories.
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

describe('GET /api/v1/auth/me (protected route)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetTestState();
    resetRepositoryMocks();
  });

  it('rejects a request with no Authorization header', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'MISSING_ACCESS_TOKEN' },
    });
  });

  it('rejects a non-Bearer Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects a token signed with a foreign secret', async () => {
    const forged = jwt.sign({ sid: 'x', typ: 'access' }, 'attacker-secret-value-long-enough', {
      subject: USER_ID,
      issuer: 'orthoflow-api',
      audience: 'orthoflow-app',
      expiresIn: 900,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${forged}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('returns the caller and their memberships for a valid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toMatchObject({ id: USER_ID, email: 'amine@clinic.tn' });
    expect(body.data.memberships).toHaveLength(1);
    expect(body.data.memberships[0].clinicId).toBe(CLINIC_A);
  });

  it('never serializes the password hash', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: authHeader(),
    });

    expect(response.payload).not.toMatch(/passwordHash|argon2/i);
  });

  it('rejects an access token whose session has been revoked', async () => {
    // A logout must invalidate in-flight access tokens immediately, rather than
    // leaving them usable until they expire.
    testState.sessionUsable = false;
    authSessionRepositoryMock.isSessionUsable.mockResolvedValueOnce(false);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('SESSION_REVOKED');
  });

  it('rejects an authenticated account until its email is verified', async () => {
    testState.emailVerified = false;

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('does not reveal whether a password-recovery email belongs to an account', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'missing@clinic.test' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ success: true, data: { accepted: true } });
  });
});

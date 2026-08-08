import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { tokenService } from '../../src/infrastructure/security/token.service.js';
import { SESSION_ID, USER_ID } from './repository-mocks.js';

/**
 * HTTP-level test rig.
 *
 * Repositories are mocked (see `repository-mocks.ts`) and the database plugin is
 * skipped, so these tests exercise the real routing, validation, auth and
 * tenancy pipeline without needing MongoDB. What is under test is the wiring —
 * guards, scoping, error shape — not Mongoose.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  return buildApp({ withDatabase: false });
}

export function authHeader(userId = USER_ID, sessionId = SESSION_ID): Record<string, string> {
  return { authorization: `Bearer ${tokenService.signAccessToken({ userId, sessionId })}` };
}

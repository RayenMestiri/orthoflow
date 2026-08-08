import type { FastifyRequest } from 'fastify';
import { ERROR_CODES } from '../constants/error-codes.js';
import { ForbiddenError, UnauthorizedError } from '../errors/app-error.js';
import type { AuthenticatedUser, TenantContext } from '../types/auth.types.js';

/**
 * Accessors for the request state produced by the auth guards.
 *
 * Controllers use these instead of reading `request.tenant` directly: if a route
 * is ever wired without `requireClinic`, the handler fails loudly here rather
 * than quietly running a query with `clinicId === undefined`.
 */

export function requireAuthUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.authUser) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.authUser;
}

export function requireTenant(request: FastifyRequest): TenantContext {
  if (!request.tenant) {
    throw new ForbiddenError('A clinic context is required for this action', {
      code: ERROR_CODES.CLINIC_CONTEXT_REQUIRED,
    });
  }
  return request.tenant;
}

export interface MutationContext {
  actorUserId: string;
  ip: string | null;
  userAgent: string | null;
}

/**
 * Typed views over the parts of the request Zod has already validated.
 *
 * Fastify's type provider infers request generics from the route's schema
 * object, which cannot be expressed in a controller's standalone signature.
 * Rather than weaken the route types, controllers accept a plain
 * `FastifyRequest` and read the validated payload through these helpers. The
 * assertion is sound because the route never reaches its handler unless the
 * matching Zod schema parsed successfully — the schema type and the type
 * argument here come from the same `z.infer`.
 */
export function validatedBody<T>(request: FastifyRequest): T {
  return request.body as T;
}

export function validatedParams<T>(request: FastifyRequest): T {
  return request.params as T;
}

export function validatedQuery<T>(request: FastifyRequest): T {
  return request.query as T;
}

/** Who did it, from where — attached to every audited change. */
export function mutationContext(request: FastifyRequest): MutationContext {
  return {
    actorUserId: requireAuthUser(request).id,
    ip: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
  };
}

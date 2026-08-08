import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * A route guard is a `preHandler` that either passes or throws an `AppError`.
 *
 * Guards never call `reply.send()` themselves — the centralized error handler
 * owns the response shape, so every failure looks identical to clients.
 */
export type RouteGuard = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export interface RequireClinicOptions {
  /** Route param that carries the clinic id (defaults to `clinicId`). */
  param?: string;
  /**
   * When the caller has exactly one active membership and sent no explicit
   * clinic id, use it. Disable for routes that must be unambiguous.
   */
  allowImplicit?: boolean;
}

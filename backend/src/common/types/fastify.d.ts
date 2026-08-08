import type { Permission } from '../constants/permissions.js';
import type { PlatformRole } from '../constants/roles.js';
import type { AuthenticatedUser, TenantContext } from './auth.types.js';
import type { RequireClinicOptions, RouteGuard } from './guard.types.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Trusted caller identity, or `null` on unauthenticated routes. */
    authUser: AuthenticatedUser | null;
    /** Resolved clinic scope for this request, or `null` before `requireClinic`. */
    tenant: TenantContext | null;
  }

  interface FastifyInstance {
    /** Verifies the access token and loads the caller from the database. */
    authenticate: RouteGuard;
    /**
     * Resolves and authorizes the clinic scope for this request.
     * Must run after `authenticate`.
     */
    requireClinic: (options?: RequireClinicOptions) => RouteGuard;
    /**
     * Asserts the caller holds every listed permission in the resolved clinic.
     * Must run after `requireClinic`.
     */
    requirePermission: (...permissions: Permission[]) => RouteGuard;
    /** Asserts a platform-level role (e.g. SUPER_ADMIN). */
    requirePlatformRole: (role: PlatformRole) => RouteGuard;
  }
}

export {};

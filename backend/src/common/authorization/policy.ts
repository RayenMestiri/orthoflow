import { ERROR_CODES } from '../constants/error-codes.js';
import { ROLE_PERMISSIONS, type Permission } from '../constants/permissions.js';
import { MEMBERSHIP_STATUSES, PLATFORM_ROLES, type ClinicRole } from '../constants/roles.js';
import { ForbiddenError } from '../errors/app-error.js';
import type { AuthenticatedUser, TenantContext } from '../types/auth.types.js';

/**
 * Pure authorization rules.
 *
 * Kept free of Fastify and MongoDB on purpose: these are the decisions that
 * protect one clinic's patients and money from another's, and they must be
 * testable in isolation, without a server or a database.
 */

export function isPlatformAdmin(user: AuthenticatedUser): boolean {
  return user.platformRole === PLATFORM_ROLES.SUPER_ADMIN;
}

/** The caller's active role in a clinic, or `null` if they are not a member. */
export function resolveClinicRole(user: AuthenticatedUser, clinicId: string): ClinicRole | null {
  const membership = user.memberships.find(
    (candidate) =>
      candidate.clinicId === clinicId && candidate.status === MEMBERSHIP_STATUSES.ACTIVE,
  );
  return membership?.role ?? null;
}

/**
 * Builds the tenant context for a request, or throws.
 *
 * A SUPER_ADMIN may act in any clinic without a membership; everybody else must
 * hold an ACTIVE membership in exactly the clinic being addressed.
 */
export function buildTenantContext(user: AuthenticatedUser, clinicId: string): TenantContext {
  const role = resolveClinicRole(user, clinicId);

  if (role !== null) {
    return { clinicId, role, isPlatformAdmin: isPlatformAdmin(user) };
  }

  if (isPlatformAdmin(user)) {
    return { clinicId, role: null, isPlatformAdmin: true };
  }

  // Same message whether the clinic exists or not — membership probing must not
  // become a way to enumerate other practices.
  throw new ForbiddenError('You do not have access to this clinic', {
    code: ERROR_CODES.CLINIC_ACCESS_DENIED,
  });
}

export function hasPermission(tenant: TenantContext, permission: Permission): boolean {
  if (tenant.role === null) {
    // Only reachable for a platform admin acting outside their memberships.
    return tenant.isPlatformAdmin;
  }
  return ROLE_PERMISSIONS[tenant.role].includes(permission);
}

export function assertPermissions(tenant: TenantContext, permissions: Permission[]): void {
  const missing = permissions.filter((permission) => !hasPermission(tenant, permission));

  if (missing.length > 0) {
    throw new ForbiddenError('You are not allowed to perform this action in this clinic', {
      code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
      details: { required: missing, role: tenant.role },
    });
  }
}

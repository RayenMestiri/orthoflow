import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { assertPermissions, buildTenantContext } from '../common/authorization/policy.js';
import { CLINIC_HEADER } from '../common/constants/api.js';
import { ERROR_CODES } from '../common/constants/error-codes.js';
import type { Permission } from '../common/constants/permissions.js';
import type { PlatformRole } from '../common/constants/roles.js';
import { ForbiddenError, UnauthorizedError } from '../common/errors/app-error.js';
import type { RequireClinicOptions, RouteGuard } from '../common/types/guard.types.js';
import { isValidObjectId } from '../common/utils/object-id.js';
import { authService } from '../modules/auth/auth.service.js';
import { CLINIC_STATUSES } from '../modules/clinics/clinic.types.js';
import { clinicRepository } from '../modules/clinics/clinic.repository.js';
import { tokenService } from '../infrastructure/security/token.service.js';

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

function extractBearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization;

  if (typeof header !== 'string' || header.length === 0) {
    throw new UnauthorizedError('Authorization header is missing', {
      code: ERROR_CODES.MISSING_ACCESS_TOKEN,
    });
  }

  const match = BEARER_PATTERN.exec(header);
  if (!match?.[1]) {
    throw new UnauthorizedError('Authorization header must be a Bearer token', {
      code: ERROR_CODES.MISSING_ACCESS_TOKEN,
    });
  }

  return match[1].trim();
}

function requireAuthUser(request: FastifyRequest) {
  if (!request.authUser) {
    // A programming error, not a client error: a route wired `requireClinic`
    // without `authenticate` in front of it.
    throw new UnauthorizedError('Authentication required');
  }
  return request.authUser;
}

/**
 * Reads the requested clinic id from — in order — the route param, the
 * `x-clinic-id` header, or the query string.
 *
 * This value is only ever a *request*: `buildTenantContext` decides whether the
 * caller may actually work in that clinic. Nothing downstream reads a clinic id
 * from the body.
 */
function readRequestedClinicId(request: FastifyRequest, paramName: string): string | null {
  const params = request.params as Record<string, unknown> | undefined;
  const paramValue = params?.[paramName];
  if (typeof paramValue === 'string' && paramValue.length > 0) {
    return paramValue;
  }

  const headerValue = request.headers[CLINIC_HEADER];
  if (typeof headerValue === 'string' && headerValue.length > 0) {
    return headerValue;
  }

  const query = request.query as Record<string, unknown> | undefined;
  const queryValue = query?.clinicId;
  if (typeof queryValue === 'string' && queryValue.length > 0) {
    return queryValue;
  }

  return null;
}

/**
 * Authentication and clinic-scoped authorization.
 *
 * Guards are exposed as instance decorators so a route reads as a sentence:
 * `preHandler: [app.authenticate, app.requireClinic(), app.requirePermission(PATIENT_READ)]`.
 */
export const authPlugin = fp(
  async (app) => {
    app.decorateRequest('authUser', null);
    app.decorateRequest('tenant', null);

    const authenticate: RouteGuard = async (request) => {
      const token = extractBearerToken(request);
      const payload = tokenService.verifyAccessToken(token);

      const user = await authService.loadAuthenticatedUser(payload.sub, payload.sid);
      request.authUser = user;

      // Every subsequent log line for this request carries the actor.
      request.log = request.log.child({ userId: user.id });
    };

    const requireClinic = (options: RequireClinicOptions = {}): RouteGuard => {
      const paramName = options.param ?? 'clinicId';
      const allowImplicit = options.allowImplicit ?? true;

      return async (request) => {
        const user = requireAuthUser(request);
        let clinicId = readRequestedClinicId(request, paramName);

        if (clinicId === null && allowImplicit) {
          // Single-clinic staff — the overwhelmingly common case — should not
          // have to send a header to use the app.
          if (user.memberships.length === 1) {
            clinicId = user.memberships[0]?.clinicId ?? null;
          } else if (user.memberships.length > 1) {
            throw new ForbiddenError(
              `You belong to several clinics. Send the ${CLINIC_HEADER} header to choose one.`,
              { code: ERROR_CODES.CLINIC_CONTEXT_AMBIGUOUS },
            );
          }
        }

        if (clinicId === null || !isValidObjectId(clinicId)) {
          throw new ForbiddenError(`A valid clinic context is required (${CLINIC_HEADER})`, {
            code: ERROR_CODES.CLINIC_CONTEXT_REQUIRED,
          });
        }

        const tenant = buildTenantContext(user, clinicId);

        const clinic = await clinicRepository.findById(clinicId);
        if (!clinic || clinic.status !== CLINIC_STATUSES.ACTIVE) {
          throw new ForbiddenError('This clinic is not active', {
            code: ERROR_CODES.CLINIC_ACCESS_DENIED,
          });
        }

        request.tenant = tenant;
        request.log = request.log.child({ clinicId: tenant.clinicId });
      };
    };

    const requirePermission = (...permissions: Permission[]): RouteGuard => {
      return async (request) => {
        requireAuthUser(request);

        if (!request.tenant) {
          throw new ForbiddenError('A clinic context is required for this action', {
            code: ERROR_CODES.CLINIC_CONTEXT_REQUIRED,
          });
        }

        assertPermissions(request.tenant, permissions);
      };
    };

    const requirePlatformRole = (role: PlatformRole): RouteGuard => {
      return async (request) => {
        const user = requireAuthUser(request);
        if (user.platformRole !== role) {
          throw new ForbiddenError('This action requires platform administrator access', {
            code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
          });
        }
      };
    };

    app.decorate('authenticate', authenticate);
    app.decorate('requireClinic', requireClinic);
    app.decorate('requirePermission', requirePermission);
    app.decorate('requirePlatformRole', requirePlatformRole);
  },
  { name: 'auth-plugin' },
);

import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { ERROR_CODES } from '../common/constants/error-codes.js';
import { UnauthorizedError } from '../common/errors/app-error.js';
import type { RouteGuard } from '../common/types/guard.types.js';
import { portalTokenService } from '../infrastructure/security/portal-token.service.js';
import { portalAuthService } from '../modules/portal/portal-auth.service.js';

const BEARER = /^Bearer\s+(.+)$/i;
function tokenFrom(request: FastifyRequest): string {
  const value = request.headers.authorization;
  const match = typeof value === 'string' ? BEARER.exec(value) : null;
  if (!match?.[1])
    throw new UnauthorizedError('Portal access token is required', {
      code: ERROR_CODES.MISSING_ACCESS_TOKEN,
    });
  return match[1].trim();
}

export const portalAuthPlugin = fp(
  async (app) => {
    app.decorateRequest('portalUser', null);
    const authenticatePortal: RouteGuard = async (request) => {
      const payload = portalTokenService.verifyAccessToken(tokenFrom(request));
      request.portalUser = await portalAuthService.loadAuthenticated(payload.sub, payload.sid);
      request.log = request.log.child({
        portalUserId: request.portalUser.id,
        clinicId: request.portalUser.clinicId,
      });
    };
    app.decorate('authenticatePortal', authenticatePortal);
  },
  { name: 'portal-auth-plugin' },
);

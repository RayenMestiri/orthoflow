import type { FastifyReply } from 'fastify';
import {
  PORTAL_REFRESH_COOKIE_NAME,
  PORTAL_REFRESH_COOKIE_PATH,
} from '../../common/constants/api.js';
import { isProduction } from '../../config/env.js';
import { portalTokenService } from '../../infrastructure/security/portal-token.service.js';

export function setPortalRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(PORTAL_REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: PORTAL_REFRESH_COOKIE_PATH,
    maxAge: portalTokenService.refreshTokenTtlSeconds,
  });
}
export function clearPortalRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(PORTAL_REFRESH_COOKIE_NAME, { path: PORTAL_REFRESH_COOKIE_PATH });
}

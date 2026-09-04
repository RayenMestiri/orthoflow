import type { FastifyReply } from 'fastify';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from '../../common/constants/api.js';
import { isProduction } from '../../config/env.js';
import { tokenService } from '../../infrastructure/security/token.service.js';

/**
 * Refresh-token cookie handling.
 *
 * `httpOnly` keeps the token away from JavaScript (and therefore from XSS);
 * scoping `path` to the auth routes means it is not attached to every ordinary
 * API call, so a leak has fewer places to happen. Non-browser clients ignore all
 * of this and use the token from the response body.
 */
export function setRefreshCookie(reply: FastifyReply, refreshToken: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    // In production, when frontend (e.g. Vercel) and API (e.g. Render) reside on
    // distinct domains, 'none' is required for cross-origin credentials over HTTPS.
    sameSite: isProduction ? 'none' : 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: tokenService.refreshTokenTtlSeconds,
  });
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

import type { FastifyReply, FastifyRequest } from 'fastify';
import { PORTAL_REFRESH_COOKIE_NAME } from '../../common/constants/api.js';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import { validatedBody } from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import { clearPortalRefreshCookie, setPortalRefreshCookie } from './portal.cookies.js';
import { portalAuthService } from './portal-auth.service.js';
import type {
  PortalActivateBody,
  PortalLoginBody,
  PortalLogoutBody,
  PortalRefreshBody,
} from './portal.schema.js';

function context(request: FastifyRequest) {
  return { ip: request.ip, userAgent: request.headers['user-agent'] ?? null };
}
function requirePortal(request: FastifyRequest) {
  if (!request.portalUser) throw new UnauthorizedError('Portal authentication required');
  return request.portalUser;
}
function publicTokens(tokens: { accessToken: string; tokenType: 'Bearer'; expiresIn: number }) {
  return {
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType,
    expiresIn: tokens.expiresIn,
  };
}

export async function activatePortalHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = validatedBody<PortalActivateBody>(request);
  const result = await portalAuthService.activate(body.token, body.password, context(request));
  setPortalRefreshCookie(reply, result.tokens.refreshToken);
  return reply.status(201).send(ok({ user: result.user, tokens: publicTokens(result.tokens) }));
}
export async function loginPortalHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = validatedBody<PortalLoginBody>(request);
  const result = await portalAuthService.login(body.email, body.password, context(request));
  setPortalRefreshCookie(reply, result.tokens.refreshToken);
  return reply.send(ok({ user: result.user, tokens: publicTokens(result.tokens) }));
}
export async function refreshPortalHandler(request: FastifyRequest, reply: FastifyReply) {
  const raw =
    request.cookies[PORTAL_REFRESH_COOKIE_NAME] ??
    validatedBody<PortalRefreshBody>(request)?.refreshToken;
  if (!raw)
    throw new UnauthorizedError('A portal refresh token is required', {
      code: ERROR_CODES.INVALID_REFRESH_TOKEN,
    });
  const tokens = await portalAuthService.refresh(raw, context(request));
  setPortalRefreshCookie(reply, tokens.refreshToken);
  return reply.send(ok({ tokens: publicTokens(tokens) }));
}
export async function logoutPortalHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = requirePortal(request);
  await portalAuthService.logout(
    user.id,
    user.sessionId,
    validatedBody<PortalLogoutBody>(request)?.allDevices ?? false,
  );
  clearPortalRefreshCookie(reply);
  return reply.send(ok({ loggedOut: true as const }));
}
export async function portalForgotPasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = validatedBody<{ email: string }>(request);
  const result = await portalAuthService.requestPasswordReset(body.email);
  return reply.send(ok({ message: result.message }));
}

export async function portalResetPasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = validatedBody<{ token: string; password: string }>(request);
  const result = await portalAuthService.resetPassword(body.token, body.password, context(request));
  return reply.send(
    ok({
      email: result.email,
      message: 'Votre mot de passe a été réinitialisé avec succès.',
    }),
  );
}

export async function portalMeHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(ok(await portalAuthService.me(requirePortal(request))));
}

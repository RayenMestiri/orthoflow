import type { FastifyReply, FastifyRequest } from 'fastify';
import { REFRESH_COOKIE_NAME } from '../../common/constants/api.js';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import { requireAuthUser, validatedBody } from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import { clearRefreshCookie, setRefreshCookie } from './auth.cookies.js';
import { authService } from './auth.service.js';
import { authChallengeService } from './auth-challenge.service.js';
import type { AuthRequestContext } from './auth.types.js';
import type {
  EmailActionBody,
  LoginBody,
  LogoutBody,
  RefreshBody,
  RegisterBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from './auth.schema.js';

/**
 * Thin HTTP adapter: read validated input, call a use case, shape the response.
 * No branching on business state, no database access, no try/catch.
 */

function requestContext(request: FastifyRequest): AuthRequestContext {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
  };
}

function publicTokens(tokens: { accessToken: string; tokenType: 'Bearer'; expiresIn: number }) {
  return {
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType,
    expiresIn: tokens.expiresIn,
  };
}

export async function registerHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await authService.register(
    validatedBody<RegisterBody>(request),
    requestContext(request),
  );
  setRefreshCookie(reply, result.tokens.refreshToken);

  return reply.status(201).send(
    ok({
      user: result.user,
      clinic: result.clinic,
      memberships: result.memberships,
      tokens: publicTokens(result.tokens),
      verification: result.verification,
    }),
  );
}

export async function loginHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await authService.login(
    validatedBody<LoginBody>(request),
    requestContext(request),
  );
  setRefreshCookie(reply, result.tokens.refreshToken);

  return reply.send(
    ok({ user: result.user, memberships: result.memberships, tokens: publicTokens(result.tokens) }),
  );
}

export async function refreshHandler(request: FastifyRequest, reply: FastifyReply) {
  // Cookie first: a browser client should never have to hold the token in JS.
  const token =
    request.cookies[REFRESH_COOKIE_NAME] ?? validatedBody<RefreshBody>(request)?.refreshToken;

  if (!token) {
    throw new UnauthorizedError('A refresh token is required', {
      code: ERROR_CODES.INVALID_REFRESH_TOKEN,
    });
  }

  const tokens = await authService.refresh(token, requestContext(request));
  setRefreshCookie(reply, tokens.refreshToken);

  return reply.send(ok({ tokens: publicTokens(tokens) }));
}

export async function logoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const authUser = requireAuthUser(request);

  await authService.logout(
    authUser.id,
    authUser.sessionId,
    validatedBody<LogoutBody>(request)?.allDevices ?? false,
    requestContext(request),
  );
  clearRefreshCookie(reply);

  return reply.send(ok({ loggedOut: true as const }));
}

export async function currentUserHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await authService.getCurrentUser(requireAuthUser(request).id);
  return reply.send(ok(result));
}

export async function verifyEmailHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = validatedBody<VerifyEmailBody>(request);
  await authChallengeService.verifyEmail(body.email, body.code, requestContext(request));
  return reply.send(ok({ verified: true as const }));
}

export async function resendVerificationHandler(request: FastifyRequest, reply: FastifyReply) {
  await authChallengeService.resendEmailVerification(validatedBody<EmailActionBody>(request).email);
  return reply.status(202).send(ok({ accepted: true as const }));
}

export async function forgotPasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  await authChallengeService.requestPasswordReset(validatedBody<EmailActionBody>(request).email);
  return reply.status(202).send(ok({ accepted: true as const }));
}

export async function resetPasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = validatedBody<ResetPasswordBody>(request);
  await authChallengeService.resetPassword(
    body.email,
    body.code,
    body.password,
    requestContext(request),
  );
  return reply.send(ok({ passwordReset: true as const }));
}

import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { ERROR_CODES, type ErrorCode } from '../../common/constants/error-codes.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import { parseDurationToSeconds } from '../../common/utils/duration.js';

const ALGORITHM = 'HS256' as const;
const accessSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  typ: z.literal('access'),
  prn: z.literal('PORTAL'),
});
const refreshSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  fid: z.string().min(1),
  typ: z.literal('refresh'),
  prn: z.literal('PORTAL'),
});
export type PortalAccessPayload = z.infer<typeof accessSchema>;
export type PortalRefreshPayload = z.infer<typeof refreshSchema>;

export class PortalTokenService {
  readonly accessTokenTtlSeconds = parseDurationToSeconds(env.PORTAL_JWT_ACCESS_EXPIRES_IN);
  readonly refreshTokenTtlSeconds = parseDurationToSeconds(env.PORTAL_JWT_REFRESH_EXPIRES_IN);

  signAccessToken(portalUserId: string, sessionId: string): string {
    return jwt.sign(
      { sid: sessionId, typ: 'access', prn: 'PORTAL' },
      env.PORTAL_JWT_ACCESS_SECRET,
      {
        algorithm: ALGORITHM,
        subject: portalUserId,
        issuer: env.JWT_ISSUER,
        audience: env.PORTAL_JWT_AUDIENCE,
        expiresIn: this.accessTokenTtlSeconds,
      },
    );
  }

  signRefreshToken(portalUserId: string, sessionId: string, familyId: string): string {
    return jwt.sign(
      { sid: sessionId, fid: familyId, typ: 'refresh', prn: 'PORTAL' },
      env.PORTAL_JWT_REFRESH_SECRET,
      {
        algorithm: ALGORITHM,
        subject: portalUserId,
        issuer: env.JWT_ISSUER,
        audience: env.PORTAL_JWT_AUDIENCE,
        expiresIn: this.refreshTokenTtlSeconds,
      },
    );
  }

  verifyAccessToken(token: string): PortalAccessPayload {
    const parsed = accessSchema.safeParse(
      this.verify(token, env.PORTAL_JWT_ACCESS_SECRET, ERROR_CODES.INVALID_ACCESS_TOKEN),
    );
    if (!parsed.success)
      throw new UnauthorizedError('Portal access token is invalid', {
        code: ERROR_CODES.INVALID_ACCESS_TOKEN,
      });
    return parsed.data;
  }
  verifyRefreshToken(token: string): PortalRefreshPayload {
    const parsed = refreshSchema.safeParse(
      this.verify(token, env.PORTAL_JWT_REFRESH_SECRET, ERROR_CODES.INVALID_REFRESH_TOKEN),
    );
    if (!parsed.success)
      throw new UnauthorizedError('Portal refresh token is invalid', {
        code: ERROR_CODES.INVALID_REFRESH_TOKEN,
      });
    return parsed.data;
  }

  private verify(token: string, secret: string, code: ErrorCode): unknown {
    try {
      return jwt.verify(token, secret, {
        algorithms: [ALGORITHM],
        issuer: env.JWT_ISSUER,
        audience: env.PORTAL_JWT_AUDIENCE,
      });
    } catch (error) {
      throw new UnauthorizedError('Portal token is invalid or expired', { code, cause: error });
    }
  }
}
export const portalTokenService = new PortalTokenService();

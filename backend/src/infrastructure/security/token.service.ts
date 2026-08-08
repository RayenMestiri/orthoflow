import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import { parseDurationToSeconds } from '../../common/utils/duration.js';
import {
  TOKEN_TYPES,
  type AccessTokenPayload,
  type RefreshTokenPayload,
} from '../../common/types/auth.types.js';

const ALGORITHM = 'HS256' as const;

/**
 * The decoded payload is validated with Zod, not trusted from the JWT library.
 * A signature proves the token came from us; it does not prove the claims still
 * have the shape this version of the code expects.
 */
const accessPayloadSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  typ: z.literal(TOKEN_TYPES.ACCESS),
});

const refreshPayloadSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  fid: z.string().min(1),
  typ: z.literal(TOKEN_TYPES.REFRESH),
});

export interface AccessTokenInput {
  userId: string;
  sessionId: string;
}

export interface RefreshTokenInput extends AccessTokenInput {
  familyId: string;
}

export class TokenService {
  readonly accessTokenTtlSeconds = parseDurationToSeconds(env.JWT_ACCESS_EXPIRES_IN);
  readonly refreshTokenTtlSeconds = parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);

  signAccessToken(input: AccessTokenInput): string {
    return jwt.sign({ sid: input.sessionId, typ: TOKEN_TYPES.ACCESS }, env.JWT_ACCESS_SECRET, {
      algorithm: ALGORITHM,
      subject: input.userId,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      expiresIn: this.accessTokenTtlSeconds,
    });
  }

  signRefreshToken(input: RefreshTokenInput): string {
    return jwt.sign(
      { sid: input.sessionId, fid: input.familyId, typ: TOKEN_TYPES.REFRESH },
      env.JWT_REFRESH_SECRET,
      {
        algorithm: ALGORITHM,
        subject: input.userId,
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        expiresIn: this.refreshTokenTtlSeconds,
      },
    );
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const payload = this.verify(token, env.JWT_ACCESS_SECRET, {
      expired: ERROR_CODES.ACCESS_TOKEN_EXPIRED,
      invalid: ERROR_CODES.INVALID_ACCESS_TOKEN,
    });

    const parsed = accessPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new UnauthorizedError('Invalid access token', {
        code: ERROR_CODES.INVALID_ACCESS_TOKEN,
      });
    }
    return parsed.data;
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const payload = this.verify(token, env.JWT_REFRESH_SECRET, {
      expired: ERROR_CODES.INVALID_REFRESH_TOKEN,
      invalid: ERROR_CODES.INVALID_REFRESH_TOKEN,
    });

    const parsed = refreshPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new UnauthorizedError('Invalid refresh token', {
        code: ERROR_CODES.INVALID_REFRESH_TOKEN,
      });
    }
    return parsed.data;
  }

  private verify(
    token: string,
    secret: string,
    codes: {
      expired: (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
      invalid: (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
    },
  ): unknown {
    try {
      return jwt.verify(token, secret, {
        algorithms: [ALGORITHM],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token has expired', { code: codes.expired, cause: error });
      }
      throw new UnauthorizedError('Token is invalid', { code: codes.invalid, cause: error });
    }
  }
}

export const tokenService = new TokenService();

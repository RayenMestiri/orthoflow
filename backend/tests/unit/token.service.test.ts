import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/common/constants/error-codes.js';
import { UnauthorizedError } from '../../src/common/errors/app-error.js';
import { tokenService } from '../../src/infrastructure/security/token.service.js';

const USER_ID = '652f1c9b8a1e4f0012ab0001';
const SESSION_ID = '652f1c9b8a1e4f0012ab0002';
const FAMILY_ID = '2b5b6e6c-1f4a-4d7e-9f4b-9a1f2c3d4e5f';

describe('TokenService', () => {
  it('round-trips an access token', () => {
    const token = tokenService.signAccessToken({ userId: USER_ID, sessionId: SESSION_ID });
    const payload = tokenService.verifyAccessToken(token);

    expect(payload).toMatchObject({ sub: USER_ID, sid: SESSION_ID, typ: 'access' });
  });

  it('round-trips a refresh token and carries the family id', () => {
    const token = tokenService.signRefreshToken({
      userId: USER_ID,
      sessionId: SESSION_ID,
      familyId: FAMILY_ID,
    });

    expect(tokenService.verifyRefreshToken(token)).toMatchObject({
      sub: USER_ID,
      sid: SESSION_ID,
      fid: FAMILY_ID,
      typ: 'refresh',
    });
  });

  it('keeps no role or permission in the access token', () => {
    const token = tokenService.signAccessToken({ userId: USER_ID, sessionId: SESSION_ID });
    const decoded = jwt.decode(token) as Record<string, unknown>;

    // Authority is re-read from the database on every request; a token that
    // carried a role would keep granting it after the role was revoked.
    expect(decoded).not.toHaveProperty('role');
    expect(decoded).not.toHaveProperty('clinicId');
    expect(decoded).not.toHaveProperty('permissions');
  });

  it('refuses an access token presented as a refresh token', () => {
    const accessToken = tokenService.signAccessToken({ userId: USER_ID, sessionId: SESSION_ID });

    expect(() => tokenService.verifyRefreshToken(accessToken)).toThrow(UnauthorizedError);
  });

  it('refuses a refresh token presented as an access token', () => {
    const refreshToken = tokenService.signRefreshToken({
      userId: USER_ID,
      sessionId: SESSION_ID,
      familyId: FAMILY_ID,
    });

    expect(() => tokenService.verifyAccessToken(refreshToken)).toThrow(UnauthorizedError);
  });

  it('refuses a token signed with another secret', () => {
    const forged = jwt.sign({ sid: SESSION_ID, typ: 'access' }, 'an-attackers-own-secret-value', {
      subject: USER_ID,
      issuer: 'orthoflow-api',
      audience: 'orthoflow-app',
      expiresIn: 900,
    });

    expect(() => tokenService.verifyAccessToken(forged)).toThrow(UnauthorizedError);
  });

  it('refuses an unsigned ("alg: none") token', () => {
    const unsigned = jwt.sign({ sid: SESSION_ID, typ: 'access' }, '', {
      algorithm: 'none',
      subject: USER_ID,
      issuer: 'orthoflow-api',
      audience: 'orthoflow-app',
    });

    expect(() => tokenService.verifyAccessToken(unsigned)).toThrow(UnauthorizedError);
  });

  it('reports an expired access token with its own error code', () => {
    const expired = jwt.sign(
      { sid: SESSION_ID, typ: 'access' },
      process.env.JWT_ACCESS_SECRET as string,
      {
        subject: USER_ID,
        issuer: 'orthoflow-api',
        audience: 'orthoflow-app',
        expiresIn: -10,
      },
    );

    try {
      tokenService.verifyAccessToken(expired);
      expect.unreachable('verifyAccessToken should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect((error as UnauthorizedError).code).toBe(ERROR_CODES.ACCESS_TOKEN_EXPIRED);
    }
  });

  it('derives token lifetimes from the configured durations', () => {
    expect(tokenService.accessTokenTtlSeconds).toBe(15 * 60);
    expect(tokenService.refreshTokenTtlSeconds).toBe(30 * 24 * 60 * 60);
  });
});

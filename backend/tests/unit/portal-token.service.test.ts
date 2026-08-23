import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/common/constants/error-codes.js';
import { UnauthorizedError } from '../../src/common/errors/app-error.js';
import { env } from '../../src/config/env.js';
import { portalTokenService } from '../../src/infrastructure/security/portal-token.service.js';
import { tokenService } from '../../src/infrastructure/security/token.service.js';

const USER_ID = '652f1c9b8a1e4f0012ab0001';
const SESSION_ID = '652f1c9b8a1e4f0012ab0002';
const FAMILY_ID = 'a51fd237-4ba4-4384-a04e-fd2fce3f49f8';

describe('PortalTokenService', () => {
  it('round-trips purpose-marked portal access and refresh tokens', () => {
    const access = portalTokenService.signAccessToken(USER_ID, SESSION_ID);
    const refresh = portalTokenService.signRefreshToken(USER_ID, SESSION_ID, FAMILY_ID);

    expect(portalTokenService.verifyAccessToken(access)).toMatchObject({
      sub: USER_ID,
      sid: SESSION_ID,
      typ: 'access',
      prn: 'PORTAL',
    });
    expect(portalTokenService.verifyRefreshToken(refresh)).toMatchObject({
      sub: USER_ID,
      sid: SESSION_ID,
      fid: FAMILY_ID,
      typ: 'refresh',
      prn: 'PORTAL',
    });
  });

  it('keeps portal tokens outside the staff token audience', () => {
    const portalToken = portalTokenService.signAccessToken(USER_ID, SESSION_ID);
    const staffToken = tokenService.signAccessToken({ userId: USER_ID, sessionId: SESSION_ID });

    expect(() => tokenService.verifyAccessToken(portalToken)).toThrow(UnauthorizedError);
    expect(() => portalTokenService.verifyAccessToken(staffToken)).toThrow(UnauthorizedError);
  });

  it('never carries clinic, patient, staff role, or permissions claims', () => {
    const decoded = jwt.decode(portalTokenService.signAccessToken(USER_ID, SESSION_ID)) as Record<
      string,
      unknown
    >;

    expect(decoded).not.toHaveProperty('clinicId');
    expect(decoded).not.toHaveProperty('guardianId');
    expect(decoded).not.toHaveProperty('patientId');
    expect(decoded).not.toHaveProperty('role');
    expect(decoded).not.toHaveProperty('permissions');
  });

  it('returns the refresh-specific error code for an invalid refresh token', () => {
    const malformed = jwt.sign(
      { sid: SESSION_ID, fid: FAMILY_ID, typ: 'refresh', prn: 'PORTAL' },
      'another-refresh-secret-that-is-long-enough',
      {
        subject: USER_ID,
        issuer: env.JWT_ISSUER,
        audience: env.PORTAL_JWT_AUDIENCE,
        expiresIn: 60,
      },
    );

    try {
      portalTokenService.verifyRefreshToken(malformed);
      expect.unreachable('verifyRefreshToken should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect((error as UnauthorizedError).code).toBe(ERROR_CODES.INVALID_REFRESH_TOKEN);
    }
  });
});

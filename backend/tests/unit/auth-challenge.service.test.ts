import { createHmac } from 'node:crypto';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { AuthChallengeService } from '../../src/modules/auth/auth-challenge.service.js';
import type {
  AuthChallengePurpose,
  AuthChallengeRecord,
} from '../../src/modules/auth/auth-challenge.types.js';

const USER_ID = '652f1c9b8a1e4f0012ab0101';
const NOW = new Date('2026-01-10T12:00:00.000Z');

describe('AuthChallengeService', () => {
  let challenge: AuthChallengeRecord | null;
  let deliveredCode = '';

  const challenges = {
    find: vi.fn(async () => challenge),
    issue: vi.fn(
      async (input: {
        userId: string;
        purpose: AuthChallengePurpose;
        codeHash: string;
        maxAttempts: number;
        expiresAt: Date;
        sentAt: Date;
      }) => {
        challenge = {
          _id: new Types.ObjectId(),
          userId: new Types.ObjectId(input.userId),
          purpose: input.purpose,
          codeHash: input.codeHash,
          attempts: 0,
          maxAttempts: input.maxAttempts,
          expiresAt: input.expiresAt,
          consumedAt: null,
          sentAt: input.sentAt,
          createdAt: NOW,
          updatedAt: NOW,
        };
      },
    ),
    consumeIfValid: vi.fn(
      async (_userId: string, _purpose: AuthChallengePurpose, codeHash: string) => {
        if (!challenge || challenge.codeHash !== codeHash || challenge.consumedAt !== null) {
          return false;
        }
        challenge.consumedAt = new Date();
        return true;
      },
    ),
    recordFailedAttempt: vi.fn(async () => {
      if (challenge) {
        challenge.attempts += 1;
      }
    }),
    clearCooldown: vi.fn(async () => undefined),
  };

  const user = {
    _id: new Types.ObjectId(USER_ID),
    email: 'owner@clinic.test',
    firstName: 'Nadia',
    lastName: 'Mansour',
    phone: null,
    platformRole: 'USER' as const,
    status: 'ACTIVE' as const,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const users = {
    findByEmail: vi.fn(async (): Promise<typeof user | null> => user),
    markEmailVerified: vi.fn(async () => undefined),
    updatePasswordHash: vi.fn(async () => undefined),
  };
  const emails = {
    sendAuthCode: vi.fn(async (message: { code: string }) => {
      deliveredCode = message.code;
      return true;
    }),
  };
  const passwords = { hash: vi.fn(async () => 'argon2id-hash') };
  const sessions = { revokeAllForUser: vi.fn(async () => 1) };
  const audit = { recordSafe: vi.fn(async () => undefined) };

  beforeEach(() => {
    challenge = null;
    deliveredCode = '';
    vi.clearAllMocks();
  });

  it('issues a six-digit code but stores only its keyed digest', async () => {
    const service = new AuthChallengeService(challenges, users, emails, passwords, sessions, audit);

    await expect(service.issueEmailVerification(USER_ID, user.email, user.firstName)).resolves.toBe(
      'SENT',
    );

    expect(deliveredCode).toMatch(/^\d{6}$/);
    expect(challenge?.codeHash).not.toBe(deliveredCode);
    expect(challenge?.codeHash).toBe(
      createHmac('sha256', env.AUTH_CODE_SECRET).update(deliveredCode).digest('hex'),
    );
  });

  it('consumes a verification code once and marks the account verified', async () => {
    const service = new AuthChallengeService(challenges, users, emails, passwords, sessions, audit);
    await service.issueEmailVerification(USER_ID, user.email, user.firstName);

    await service.verifyEmail(user.email, deliveredCode, { ip: '127.0.0.1', userAgent: 'vitest' });

    expect(users.markEmailVerified).toHaveBeenCalledWith(USER_ID, expect.any(Date));
    await expect(
      service.verifyEmail(user.email, deliveredCode, { ip: null, userAgent: null }),
    ).rejects.toMatchObject({ code: 'AUTH_CODE_INVALID_OR_EXPIRED' });
  });

  it('counts failed attempts without exposing the stored code', async () => {
    const service = new AuthChallengeService(challenges, users, emails, passwords, sessions, audit);
    await service.issueEmailVerification(USER_ID, user.email, user.firstName);

    await expect(
      service.verifyEmail(user.email, '000000', { ip: null, userAgent: null }),
    ).rejects.toMatchObject({ code: 'AUTH_CODE_INVALID_OR_EXPIRED' });
    expect(challenges.recordFailedAttempt).toHaveBeenCalledOnce();
  });

  it('resets the password and revokes every active session', async () => {
    const service = new AuthChallengeService(challenges, users, emails, passwords, sessions, audit);
    await service.requestPasswordReset(user.email);

    await service.resetPassword(user.email, deliveredCode, 'StrongPass123', {
      ip: '127.0.0.1',
      userAgent: 'vitest',
    });

    expect(users.updatePasswordHash).toHaveBeenCalledWith(USER_ID, 'argon2id-hash');
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(USER_ID, 'PASSWORD_CHANGED');
  });

  it('keeps password-reset requests indistinguishable for unknown accounts', async () => {
    users.findByEmail.mockResolvedValueOnce(null);
    const service = new AuthChallengeService(challenges, users, emails, passwords, sessions, audit);

    await expect(service.requestPasswordReset('missing@clinic.test')).resolves.toBeUndefined();
    expect(emails.sendAuthCode).not.toHaveBeenCalled();
  });
});

import { createHmac, randomInt } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { ValidationError } from '../../common/errors/app-error.js';
import { parseDurationToSeconds } from '../../common/utils/duration.js';
import {
  emailService,
  type EmailServiceContract,
} from '../../infrastructure/email/email.service.js';
import {
  passwordService,
  type PasswordService,
} from '../../infrastructure/security/password.service.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import { USER_STATUSES } from '../users/user.types.js';
import { authSessionRepository, type AuthSessionRepository } from './auth-session.repository.js';
import {
  authChallengeRepository,
  type AuthChallengeRepository,
} from './auth-challenge.repository.js';
import { AUTH_CHALLENGE_PURPOSES, type AuthChallengePurpose } from './auth-challenge.types.js';
import { SESSION_REVOKE_REASONS, type AuthRequestContext } from './auth.types.js';

type ChallengeStore = Pick<
  AuthChallengeRepository,
  'find' | 'issue' | 'consumeIfValid' | 'recordFailedAttempt' | 'clearCooldown'
>;
type ChallengeUsers = Pick<
  UserRepository,
  'findByEmail' | 'markEmailVerified' | 'updatePasswordHash'
>;
type ChallengePasswords = Pick<PasswordService, 'hash'>;
type ChallengeSessions = Pick<AuthSessionRepository, 'revokeAllForUser'>;
type ChallengeAudit = Pick<AuditLogService, 'recordSafe'>;

export class AuthChallengeService {
  private readonly expiresInSeconds = parseDurationToSeconds(env.AUTH_CODE_EXPIRES_IN);
  private readonly cooldownSeconds = parseDurationToSeconds(env.AUTH_CODE_RESEND_COOLDOWN);

  constructor(
    private readonly challenges: ChallengeStore = authChallengeRepository,
    private readonly users: ChallengeUsers = userRepository,
    private readonly emails: EmailServiceContract = emailService,
    private readonly passwords: ChallengePasswords = passwordService,
    private readonly sessions: ChallengeSessions = authSessionRepository,
    private readonly audit: ChallengeAudit = auditLogService,
  ) {}

  async issueEmailVerification(
    userId: string,
    email: string,
    firstName: string,
  ): Promise<'SENT' | 'UNAVAILABLE'> {
    return this.issue(userId, email, firstName, AUTH_CHALLENGE_PURPOSES.EMAIL_VERIFICATION);
  }

  async resendEmailVerification(email: string): Promise<void> {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user || user.emailVerifiedAt !== null) {
      return;
    }
    await this.issue(
      user._id.toString(),
      user.email,
      user.firstName,
      AUTH_CHALLENGE_PURPOSES.EMAIL_VERIFICATION,
    );
  }

  async verifyEmail(email: string, code: string, context: AuthRequestContext): Promise<void> {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user) {
      throw this.invalidCodeError();
    }
    if (user.emailVerifiedAt !== null) {
      return;
    }

    await this.consume(user._id.toString(), AUTH_CHALLENGE_PURPOSES.EMAIL_VERIFICATION, code);
    const verifiedAt = new Date();
    await this.users.markEmailVerified(user._id.toString(), verifiedAt);
    await this.audit.recordSafe({
      actorUserId: user._id.toString(),
      action: AUDIT_ACTIONS.AUTH_EMAIL_VERIFIED,
      resourceType: AUDIT_RESOURCE_TYPES.USER,
      resourceId: user._id.toString(),
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user || user.status !== USER_STATUSES.ACTIVE) {
      return;
    }
    await this.issue(
      user._id.toString(),
      user.email,
      user.firstName,
      AUTH_CHALLENGE_PURPOSES.PASSWORD_RESET,
    );
  }

  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
    context: AuthRequestContext,
  ): Promise<void> {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user || user.status !== USER_STATUSES.ACTIVE) {
      throw this.invalidCodeError();
    }

    const userId = user._id.toString();
    await this.consume(userId, AUTH_CHALLENGE_PURPOSES.PASSWORD_RESET, code);
    await this.users.updatePasswordHash(userId, await this.passwords.hash(newPassword));
    await this.sessions.revokeAllForUser(userId, SESSION_REVOKE_REASONS.PASSWORD_CHANGED);
    await this.audit.recordSafe({
      actorUserId: userId,
      action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET,
      resourceType: AUDIT_RESOURCE_TYPES.USER,
      resourceId: userId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  private async issue(
    userId: string,
    email: string,
    firstName: string,
    purpose: AuthChallengePurpose,
  ): Promise<'SENT' | 'UNAVAILABLE'> {
    const now = new Date();
    const existing = await this.challenges.find(userId, purpose);
    if (
      existing &&
      existing.sentAt.getTime() + this.cooldownSeconds * 1000 > now.getTime() &&
      existing.consumedAt === null
    ) {
      return 'SENT';
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.challenges.issue({
      userId,
      purpose,
      codeHash: this.hashCode(code),
      maxAttempts: env.AUTH_CODE_MAX_ATTEMPTS,
      expiresAt: new Date(now.getTime() + this.expiresInSeconds * 1000),
      sentAt: now,
    });

    try {
      const delivered = await this.emails.sendAuthCode({
        recipient: email,
        recipientName: firstName,
        code,
        purpose,
        expiresInMinutes: Math.ceil(this.expiresInSeconds / 60),
      });
      if (!delivered) {
        await this.challenges.clearCooldown(userId, purpose);
        return 'UNAVAILABLE';
      }
      return 'SENT';
    } catch (error) {
      await this.challenges.clearCooldown(userId, purpose);
      logger.error({ err: error, purpose }, 'Failed to deliver auth code email');
      return 'UNAVAILABLE';
    }
  }

  private async consume(
    userId: string,
    purpose: AuthChallengePurpose,
    code: string,
  ): Promise<void> {
    const now = new Date();
    const challenge = await this.challenges.find(userId, purpose);
    if (!challenge || challenge.consumedAt !== null || challenge.expiresAt <= now) {
      throw this.invalidCodeError();
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new ValidationError('Too many incorrect code attempts. Request a new code.', {
        code: ERROR_CODES.AUTH_CODE_ATTEMPTS_EXCEEDED,
      });
    }

    const consumed = await this.challenges.consumeIfValid(
      userId,
      purpose,
      this.hashCode(code),
      now,
    );
    if (!consumed) {
      await this.challenges.recordFailedAttempt(userId, purpose, now);
      throw this.invalidCodeError();
    }
  }

  private hashCode(code: string): string {
    return createHmac('sha256', env.AUTH_CODE_SECRET).update(code).digest('hex');
  }

  private invalidCodeError(): ValidationError {
    return new ValidationError('The code is invalid or has expired', {
      code: ERROR_CODES.AUTH_CODE_INVALID_OR_EXPIRED,
    });
  }
}

export const authChallengeService = new AuthChallengeService();

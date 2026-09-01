import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { CLINIC_ROLES, MEMBERSHIP_STATUSES, PLATFORM_ROLES } from '../../common/constants/roles.js';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../common/errors/app-error.js';
import type { AuthenticatedUser } from '../../common/types/auth.types.js';
import { buildUniqueSlug } from '../../common/utils/slug.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { safeCompareHex, sha256 } from '../../infrastructure/security/crypto.js';
import {
  passwordService,
  type PasswordService,
} from '../../infrastructure/security/password.service.js';
import { tokenService, type TokenService } from '../../infrastructure/security/token.service.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import { toClinicDto } from '../clinics/clinic.mapper.js';
import {
  membershipRepository,
  type MembershipRepository,
} from '../memberships/membership.repository.js';
import { toUserDto } from '../users/user.mapper.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import { USER_STATUSES } from '../users/user.types.js';
import { portalRepository, type PortalRepository } from '../portal/portal.repository.js';
import { authSessionRepository, type AuthSessionRepository } from './auth-session.repository.js';
import { authChallengeService, type AuthChallengeService } from './auth-challenge.service.js';
import {
  SESSION_REVOKE_REASONS,
  type AuthRequestContext,
  type AuthSessionDto,
  type AuthTokensDto,
  type CurrentUserDto,
  type LoginInput,
  type MembershipSummaryDto,
  type RegisterInput,
  type RegisterResultDto,
} from './auth.types.js';

interface IssuedSession {
  sessionId: string;
  tokens: AuthTokensDto;
}

/**
 * Authentication use cases.
 *
 * Two rules shape everything below:
 *  1. The raw refresh token is never persisted — only its SHA-256 digest.
 *  2. Identity and authority are re-read from the database on every request;
 *     the JWT carries an id and a session, never a role.
 */
export class AuthService {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly users: UserRepository = userRepository,
    private readonly clinics: ClinicRepository = clinicRepository,
    private readonly memberships: MembershipRepository = membershipRepository,
    private readonly sessions: AuthSessionRepository = authSessionRepository,
    private readonly passwords: PasswordService = passwordService,
    private readonly tokens: TokenService = tokenService,
    private readonly audit: AuditLogService = auditLogService,
    private readonly challenges: AuthChallengeService = authChallengeService,
    private readonly portal: PortalRepository = portalRepository,
  ) {}

  /**
   * Self-service onboarding: creates the person, their clinic and the ownership
   * membership that binds them. All three in one transaction — a clinic without
   * an owner is unrecoverable through the API.
   */
  async register(input: RegisterInput, context: AuthRequestContext): Promise<RegisterResultDto> {
    const email = input.email.toLowerCase();

    if (await this.users.findByEmail(email)) {
      throw new ConflictError('An account already exists for this email address', {
        code: ERROR_CODES.EMAIL_ALREADY_REGISTERED,
      });
    }

    const [passwordHash, slug, platformRole] = await Promise.all([
      this.passwords.hash(input.password),
      buildUniqueSlug(input.clinic.name, (candidate) => this.clinics.existsBySlug(candidate)),
      this.resolvePlatformRole(email),
    ]);

    const { user, clinic } = await withTransaction(async (session) => {
      const createdUser = await this.users.create(
        {
          email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          platformRole,
        },
        session,
      );

      const userId = createdUser._id.toString();

      const createdClinic = await this.clinics.create(
        {
          name: input.clinic.name,
          slug,
          createdBy: userId,
          legalName: input.clinic.legalName ?? null,
          email: input.clinic.email ?? null,
          phone: input.clinic.phone ?? null,
          ...(input.clinic.timezone === undefined ? {} : { timezone: input.clinic.timezone }),
          ...(input.clinic.currency === undefined ? {} : { currency: input.clinic.currency }),
        },
        session,
      );

      const clinicId = createdClinic._id.toString();

      const membership = await this.memberships.create(
        {
          userId,
          clinicId,
          role: CLINIC_ROLES.CLINIC_OWNER,
          status: MEMBERSHIP_STATUSES.ACTIVE,
        },
        session,
      );

      await this.audit.record(
        {
          clinicId,
          actorUserId: userId,
          action: AUDIT_ACTIONS.CLINIC_CREATED,
          resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
          resourceId: clinicId,
          metadata: { slug, membershipId: membership._id.toString() },
          ip: context.ip,
          userAgent: context.userAgent,
        },
        session,
      );

      await this.audit.record(
        {
          clinicId,
          actorUserId: userId,
          action: AUDIT_ACTIONS.AUTH_REGISTERED,
          resourceType: AUDIT_RESOURCE_TYPES.USER,
          resourceId: userId,
          metadata: { platformRole },
          ip: context.ip,
          userAgent: context.userAgent,
        },
        session,
      );

      return { user: createdUser, clinic: createdClinic };
    });

    // A new clinic gets the standard orthodontic visit kinds so its diary is
    // usable on day one. Best-effort: a seeding hiccup must not fail signup,
    // and the owner can always create types by hand.
    try {
      const { appointmentTypeService } = await import(
        '../appointment-types/appointment-type.service.js'
      );
      await appointmentTypeService.seedDefaults(clinic._id.toString(), user._id.toString());
    } catch {
      // Logged nowhere on purpose: nothing actionable beyond "create types".
    }

    const [issued, delivery] = await Promise.all([
      this.issueSession(user._id.toString(), context),
      this.challenges.issueEmailVerification(user._id.toString(), user.email, user.firstName),
    ]);

    return {
      user: toUserDto(user),
      clinic: toClinicDto(clinic),
      memberships: [
        {
          clinicId: clinic._id.toString(),
          clinicName: clinic.name,
          clinicSlug: clinic.slug,
          role: CLINIC_ROLES.CLINIC_OWNER,
          status: MEMBERSHIP_STATUSES.ACTIVE,
        },
      ],
      tokens: issued.tokens,
      verification: { required: true, delivery },
    };
  }

  async login(input: LoginInput, context: AuthRequestContext): Promise<AuthSessionDto> {
    const email = input.email.toLowerCase();
    const user = await this.users.findByEmailForAuthentication(email);

    if (!user) {
      const portalUser = await this.portal.findUserByEmail(email);
      if (portalUser) {
        throw new UnauthorizedError(
          'Cette adresse email correspond à un compte Portail Famille (Patient / Tuteur). Veuillez vous connecter via le Portail Famille.',
          { code: ERROR_CODES.PORTAL_ACCOUNT_DETECTED },
        );
      }
      // Spend the same CPU as a real verification so response time does not
      // reveal whether the address is registered.
      await this.passwords.verify(await this.getDummyHash(), input.password);
      throw new UnauthorizedError('Invalid email or password', {
        code: ERROR_CODES.INVALID_CREDENTIALS,
      });
    }

    const passwordMatches = await this.passwords.verify(user.passwordHash, input.password);
    if (!passwordMatches) {
      throw new UnauthorizedError('Invalid email or password', {
        code: ERROR_CODES.INVALID_CREDENTIALS,
      });
    }

    if (user.status !== USER_STATUSES.ACTIVE) {
      throw new ForbiddenError('This account has been disabled', {
        code: ERROR_CODES.ACCOUNT_DISABLED,
      });
    }

    if (user.emailVerifiedAt === null) {
      throw new ForbiddenError('Verify your email address before signing in', {
        code: ERROR_CODES.EMAIL_NOT_VERIFIED,
      });
    }

    const userId = user._id.toString();

    // Transparently upgrade hashes when the Argon2 parameters are raised.
    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.users.updatePasswordHash(userId, await this.passwords.hash(input.password));
    }

    const [issued, memberships] = await Promise.all([
      this.issueSession(userId, context),
      this.buildMembershipSummaries(userId),
    ]);

    await this.users.markLoggedIn(userId, new Date());
    await this.audit.recordSafe({
      actorUserId: userId,
      action: AUDIT_ACTIONS.AUTH_LOGIN,
      resourceType: AUDIT_RESOURCE_TYPES.USER,
      resourceId: userId,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const { passwordHash: _passwordHash, ...safeUser } = user;

    return { user: toUserDto(safeUser), memberships, tokens: issued.tokens };
  }

  /**
   * Rotates a refresh token.
   *
   * Rotation is one atomic revoke: whoever wins that update gets the new token
   * pair. A token presented after it was rotated away is treated as theft — the
   * whole family is burned, which logs the attacker and the victim out.
   */
  async refresh(rawRefreshToken: string, context: AuthRequestContext): Promise<AuthTokensDto> {
    const payload = this.tokens.verifyRefreshToken(rawRefreshToken);
    const stored = await this.sessions.findById(payload.sid);

    if (!stored || !safeCompareHex(stored.tokenHash, sha256(rawRefreshToken))) {
      throw new UnauthorizedError('Refresh token is not valid', {
        code: ERROR_CODES.INVALID_REFRESH_TOKEN,
      });
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError('Refresh token has expired', {
        code: ERROR_CODES.INVALID_REFRESH_TOKEN,
      });
    }

    const userId = payload.sub;
    const nextSessionId = new Types.ObjectId().toString();
    const rotated = await this.sessions.revokeIfActive(
      payload.sid,
      SESSION_REVOKE_REASONS.ROTATED,
      nextSessionId,
    );

    if (!rotated) {
      await this.sessions.revokeFamily(userId, payload.fid, SESSION_REVOKE_REASONS.REUSE_DETECTED);
      await this.audit.recordSafe({
        actorUserId: userId,
        action: AUDIT_ACTIONS.AUTH_REFRESH_REUSE_DETECTED,
        resourceType: AUDIT_RESOURCE_TYPES.AUTH_SESSION,
        resourceId: payload.sid,
        metadata: { familyId: payload.fid },
        ip: context.ip,
        userAgent: context.userAgent,
      });
      throw new UnauthorizedError('Refresh token has already been used. Please sign in again.', {
        code: ERROR_CODES.REFRESH_TOKEN_REUSED,
      });
    }

    const user = await this.users.findById(userId);
    if (!user || user.status !== USER_STATUSES.ACTIVE) {
      throw new UnauthorizedError('Account is no longer active', {
        code: ERROR_CODES.ACCOUNT_DISABLED,
      });
    }

    const issued = await this.issueSession(userId, context, payload.fid, nextSessionId);
    return issued.tokens;
  }

  async logout(
    userId: string,
    sessionId: string,
    allDevices: boolean,
    context: AuthRequestContext,
  ): Promise<void> {
    if (allDevices) {
      await this.sessions.revokeAllForUser(userId, SESSION_REVOKE_REASONS.LOGOUT_ALL);
    } else {
      await this.sessions.revokeIfActive(sessionId, SESSION_REVOKE_REASONS.LOGOUT);
    }

    await this.audit.recordSafe({
      actorUserId: userId,
      action: AUDIT_ACTIONS.AUTH_LOGOUT,
      resourceType: AUDIT_RESOURCE_TYPES.AUTH_SESSION,
      resourceId: allDevices ? null : sessionId,
      metadata: { allDevices },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  async getCurrentUser(userId: string): Promise<CurrentUserDto> {
    const [user, memberships] = await Promise.all([
      this.users.findById(userId),
      this.buildMembershipSummaries(userId),
    ]);

    if (!user) {
      throw new UnauthorizedError('Account no longer exists', {
        code: ERROR_CODES.USER_NOT_FOUND,
      });
    }

    return { user: toUserDto(user), memberships };
  }

  /**
   * Rebuilds the trusted caller identity for the auth guard.
   *
   * Deliberately hits the database on every request: a membership revoked one
   * second ago must not survive because an access token is still within its
   * 15-minute window. Redis will cache this later — the shape will not change.
   */
  async loadAuthenticatedUser(userId: string, sessionId: string): Promise<AuthenticatedUser> {
    const [user, isSessionValid, memberships] = await Promise.all([
      this.users.findById(userId),
      this.sessions.isSessionUsable(sessionId),
      this.memberships.findActiveByUser(userId),
    ]);

    if (!user) {
      throw new UnauthorizedError('Account no longer exists', {
        code: ERROR_CODES.USER_NOT_FOUND,
      });
    }

    if (user.status !== USER_STATUSES.ACTIVE) {
      throw new UnauthorizedError('This account has been disabled', {
        code: ERROR_CODES.ACCOUNT_DISABLED,
      });
    }

    if (user.emailVerifiedAt === null) {
      throw new ForbiddenError('Verify your email address to continue', {
        code: ERROR_CODES.EMAIL_NOT_VERIFIED,
      });
    }

    if (!isSessionValid) {
      throw new UnauthorizedError('Session is no longer valid', {
        code: ERROR_CODES.SESSION_REVOKED,
      });
    }

    return {
      id: userId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      platformRole: user.platformRole,
      sessionId,
      memberships: memberships.map((membership) => ({
        clinicId: membership.clinicId.toString(),
        role: membership.role,
        status: membership.status,
      })),
    };
  }

  private async issueSession(
    userId: string,
    context: AuthRequestContext,
    familyId?: string,
    sessionId?: string,
  ): Promise<IssuedSession> {
    const sid = sessionId ?? new Types.ObjectId().toString();
    const fid = familyId ?? randomUUID();

    const refreshToken = this.tokens.signRefreshToken({ userId, sessionId: sid, familyId: fid });
    const accessToken = this.tokens.signAccessToken({ userId, sessionId: sid });

    await this.sessions.create({
      sessionId: sid,
      userId,
      familyId: fid,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + this.tokens.refreshTokenTtlSeconds * 1000),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return {
      sessionId: sid,
      tokens: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: this.tokens.accessTokenTtlSeconds,
      },
    };
  }

  private async buildMembershipSummaries(userId: string): Promise<MembershipSummaryDto[]> {
    const memberships = await this.memberships.findActiveByUser(userId);
    if (memberships.length === 0) {
      return [];
    }

    const clinics = await this.clinics.findManyByIds(
      memberships.map((membership) => membership.clinicId.toString()),
    );
    const clinicsById = new Map(clinics.map((clinic) => [clinic._id.toString(), clinic]));

    return memberships.flatMap((membership) => {
      const clinic = clinicsById.get(membership.clinicId.toString());
      if (!clinic) {
        return [];
      }
      return [
        {
          clinicId: clinic._id.toString(),
          clinicName: clinic.name,
          clinicSlug: clinic.slug,
          role: membership.role,
          status: membership.status,
        },
      ];
    });
  }

  /**
   * The very first account may be promoted to SUPER_ADMIN, but only when the
   * deployment explicitly names the address and no user exists yet. Without
   * both conditions, self-service registration can never mint a platform admin.
   */
  private async resolvePlatformRole(
    email: string,
  ): Promise<(typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES]> {
    if (env.BOOTSTRAP_SUPER_ADMIN_EMAIL === '' || env.BOOTSTRAP_SUPER_ADMIN_EMAIL !== email) {
      return PLATFORM_ROLES.USER;
    }
    return (await this.users.isEmpty()) ? PLATFORM_ROLES.SUPER_ADMIN : PLATFORM_ROLES.USER;
  }

  private async getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash('orthoflow-timing-equalizer-value');
    return this.dummyHash;
  }
}

export const authService = new AuthService();

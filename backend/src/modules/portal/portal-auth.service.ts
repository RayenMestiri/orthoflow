import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../common/errors/app-error.js';
import { parseDurationToSeconds } from '../../common/utils/duration.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import {
  generateOpaqueSecret,
  safeCompareHex,
  sha256,
} from '../../infrastructure/security/crypto.js';
import { passwordService } from '../../infrastructure/security/password.service.js';
import { portalTokenService } from '../../infrastructure/security/portal-token.service.js';
import { clinicRepository } from '../clinics/clinic.repository.js';
import { guardianRepository } from '../guardians/guardian.repository.js';
import { PatientGuardianModel } from '../guardians/patient-guardian.model.js';
import { communicationEventService } from '../notifications/notification.service.js';
import { EXTERNAL_EVENT_TYPES } from '../communications/communication.types.js';
import { secretEnvelopeService } from '../../infrastructure/security/secret-envelope.service.js';
import { auditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { portalRepository } from './portal.repository.js';
import {
  PORTAL_SESSION_REVOKE_REASONS,
  PORTAL_USER_STATUSES,
  type AuthenticatedPortalUser,
  type PortalRequestContext,
  type PortalTokensDto,
} from './portal.types.js';

function portalProfile(
  user: {
    _id: Types.ObjectId;
    email: string;
    clinicId: Types.ObjectId;
    guardianId: Types.ObjectId;
  },
  guardian: { firstName: string; lastName: string },
  clinic: { name: string; timezone: string; currency: string },
) {
  return {
    id: user._id.toString(),
    email: user.email,
    fullName: `${guardian.firstName} ${guardian.lastName}`.trim(),
    guardianId: user.guardianId.toString(),
    clinic: {
      id: user.clinicId.toString(),
      name: clinic.name,
      timezone: clinic.timezone,
      currency: clinic.currency,
    },
  };
}

export class PortalAuthService {
  private readonly invitationTtlSeconds = parseDurationToSeconds(env.PORTAL_INVITATION_EXPIRES_IN);
  private dummyHash: Promise<string> | null = null;

  async invite(
    clinicId: string,
    guardianId: string,
    actorUserId: string,
  ): Promise<{ status: string; delivery: 'QUEUED'; expiresAt: string }> {
    const [guardian, clinic, existing, relationship] = await Promise.all([
      guardianRepository.findByIdInClinic(guardianId, clinicId),
      clinicRepository.findById(clinicId),
      portalRepository.findUserByGuardian(clinicId, guardianId),
      PatientGuardianModel.findOne({
        clinicId: new Types.ObjectId(clinicId),
        guardianId: new Types.ObjectId(guardianId),
      }).lean().exec(),
    ]);
    if (!guardian || !clinic || !relationship)
      throw new ConflictError('Guardian is not linked to a patient in this clinic', {
        code: ERROR_CODES.GUARDIAN_NOT_FOUND,
      });
    if (!guardian.email)
      throw new ConflictError('Add a guardian email before enabling portal access', {
        code: ERROR_CODES.PORTAL_ACCESS_NOT_CONFIGURED,
      });
    if (existing?.status === PORTAL_USER_STATUSES.ACTIVE)
      throw new ConflictError('Portal access is already active');
    const rawToken = generateOpaqueSecret();
    const expiresAt = new Date(Date.now() + this.invitationTtlSeconds * 1000);
    await withTransaction(async (session) => {
      const invitation = await portalRepository.createInvitation({
        clinicId,
        guardianId,
        email: guardian.email!,
        tokenHash: sha256(rawToken),
        expiresAt,
        invitedByUserId: actorUserId,
      }, session);
      await communicationEventService.enqueue({
        clinicId,
        type: EXTERNAL_EVENT_TYPES.PORTAL_INVITATION,
        aggregateType: 'PORTAL_INVITATION',
        aggregateId: invitation._id.toString(),
        actorUserId,
        deduplicationKey: `PORTAL_INVITATION:${invitation._id.toString()}`,
        payload: {
          patientId: relationship.patientId.toString(),
          guardianId,
          activationUrlEncrypted: secretEnvelopeService.seal(
            `${env.FRONTEND_URL}/portal/activate?token=${encodeURIComponent(rawToken)}`,
          ),
        },
      }, session);
    });
    await auditLogService.recordSafe({
      clinicId,
      actorUserId,
      actorKind: 'STAFF',
      action: AUDIT_ACTIONS.PORTAL_INVITED,
      resourceType: AUDIT_RESOURCE_TYPES.GUARDIAN,
      resourceId: guardianId,
      metadata: { delivery: 'QUEUED' },
    });
    return {
      status: 'INVITED',
      delivery: 'QUEUED',
      expiresAt: expiresAt.toISOString(),
    };
  }

  async status(
    clinicId: string,
    guardianId: string,
  ): Promise<{
    status: 'NOT_INVITED' | 'INVITED' | 'ACTIVE' | 'REVOKED';
    email: string | null;
    expiresAt: string | null;
  }> {
    const [guardian, user, invitation] = await Promise.all([
      guardianRepository.findByIdInClinic(guardianId, clinicId),
      portalRepository.findUserByGuardian(clinicId, guardianId),
      portalRepository.latestInvitation(clinicId, guardianId),
    ]);
    if (!guardian)
      throw new ConflictError('Guardian is not available in this clinic', {
        code: ERROR_CODES.GUARDIAN_NOT_FOUND,
      });
    if (user) return { status: user.status, email: user.email, expiresAt: null };
    const invited =
      invitation &&
      !invitation.consumedAt &&
      !invitation.revokedAt &&
      invitation.expiresAt > new Date();
    return {
      status: invited ? 'INVITED' : 'NOT_INVITED',
      email: guardian.email,
      expiresAt: invited ? invitation.expiresAt.toISOString() : null,
    };
  }

  async activate(token: string, password: string, context: PortalRequestContext) {
    const invitation = await portalRepository.findUsableInvitation(sha256(token));
    if (!invitation)
      throw new UnauthorizedError('Invitation is invalid or expired', {
        code: ERROR_CODES.PORTAL_INVITATION_INVALID_OR_EXPIRED,
      });
    const [guardian, clinic, relationship, existing] = await Promise.all([
      guardianRepository.findByIdInClinic(
        invitation.guardianId.toString(),
        invitation.clinicId.toString(),
      ),
      clinicRepository.findById(invitation.clinicId.toString()),
      PatientGuardianModel.exists({
        clinicId: invitation.clinicId,
        guardianId: invitation.guardianId,
      }).exec(),
      portalRepository.findUserByGuardian(
        invitation.clinicId.toString(),
        invitation.guardianId.toString(),
      ),
    ]);
    if (
      !guardian ||
      !clinic ||
      !relationship ||
      guardian.email?.toLowerCase() !== invitation.email ||
      existing?.status === PORTAL_USER_STATUSES.ACTIVE
    )
      throw new UnauthorizedError('Invitation is invalid or expired', {
        code: ERROR_CODES.PORTAL_INVITATION_INVALID_OR_EXPIRED,
      });
    const passwordHash = await passwordService.hash(password);
    const user = await withTransaction(async (session) => {
      if (!(await portalRepository.consumeInvitation(invitation._id.toString(), session)))
        throw new UnauthorizedError('Invitation has already been used', {
          code: ERROR_CODES.PORTAL_INVITATION_INVALID_OR_EXPIRED,
        });
      if (existing) {
        const reactivated = await portalRepository.reactivateUser(
          {
            clinicId: invitation.clinicId.toString(),
            guardianId: invitation.guardianId.toString(),
            email: invitation.email,
            passwordHash,
          },
          session,
        );
        if (!reactivated)
          throw new UnauthorizedError('Invitation is invalid or expired', {
            code: ERROR_CODES.PORTAL_INVITATION_INVALID_OR_EXPIRED,
          });
        return reactivated;
      }
      return portalRepository.createUser(
        {
          clinicId: invitation.clinicId.toString(),
          guardianId: invitation.guardianId.toString(),
          email: invitation.email,
          passwordHash,
        },
        session,
      );
    });
    const tokens = await this.issueSession(user._id.toString(), context);
    await auditLogService.recordSafe({
      clinicId: user.clinicId.toString(),
      actorPortalUserId: user._id.toString(),
      actorKind: 'PORTAL',
      action: AUDIT_ACTIONS.PORTAL_ACTIVATED,
      resourceType: AUDIT_RESOURCE_TYPES.PORTAL_USER,
      resourceId: user._id.toString(),
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return { user: portalProfile(user, guardian, clinic), tokens };
  }

  async login(email: string, password: string, context: PortalRequestContext) {
    const user = await portalRepository.findUserByEmail(email);
    if (!user) {
      await passwordService.verify(await this.getDummyHash(), password);
      throw new UnauthorizedError('Invalid email or password', {
        code: ERROR_CODES.INVALID_CREDENTIALS,
      });
    }
    if (!(await passwordService.verify(user.passwordHash, password)))
      throw new UnauthorizedError('Invalid email or password', {
        code: ERROR_CODES.INVALID_CREDENTIALS,
      });
    if (user.status !== PORTAL_USER_STATUSES.ACTIVE)
      throw new ForbiddenError('Portal access has been revoked', {
        code: ERROR_CODES.PORTAL_ACCESS_REVOKED,
      });
    const [guardian, clinic, tokens] = await Promise.all([
      guardianRepository.findByIdInClinic(user.guardianId.toString(), user.clinicId.toString()),
      clinicRepository.findById(user.clinicId.toString()),
      this.issueSession(user._id.toString(), context),
    ]);
    if (!guardian || !clinic) throw new UnauthorizedError('Portal access is no longer available');
    await portalRepository.markLogin(user._id.toString());
    await auditLogService.recordSafe({
      clinicId: user.clinicId.toString(),
      actorPortalUserId: user._id.toString(),
      actorKind: 'PORTAL',
      action: AUDIT_ACTIONS.PORTAL_LOGIN,
      resourceType: AUDIT_RESOURCE_TYPES.PORTAL_USER,
      resourceId: user._id.toString(),
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return { user: portalProfile(user, guardian, clinic), tokens };
  }

  async refresh(raw: string, context: PortalRequestContext): Promise<PortalTokensDto> {
    const payload = portalTokenService.verifyRefreshToken(raw);
    const stored = await portalRepository.findSession(payload.sid);
    if (!stored || !safeCompareHex(stored.tokenHash, sha256(raw)) || stored.expiresAt <= new Date())
      throw new UnauthorizedError('Refresh token is invalid', {
        code: ERROR_CODES.INVALID_REFRESH_TOKEN,
      });
    const nextId = new Types.ObjectId().toString();
    if (
      !(await portalRepository.revokeSession(
        payload.sid,
        PORTAL_SESSION_REVOKE_REASONS.ROTATED,
        nextId,
      ))
    ) {
      await portalRepository.revokeFamily(
        payload.sub,
        payload.fid,
        PORTAL_SESSION_REVOKE_REASONS.REUSE_DETECTED,
      );
      await auditLogService.recordSafe({
        actorPortalUserId: payload.sub,
        actorKind: 'PORTAL',
        action: AUDIT_ACTIONS.PORTAL_REFRESH_REUSE_DETECTED,
        resourceType: AUDIT_RESOURCE_TYPES.PORTAL_SESSION,
        resourceId: payload.sid,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      throw new UnauthorizedError('Refresh token has already been used', {
        code: ERROR_CODES.REFRESH_TOKEN_REUSED,
      });
    }
    const user = await portalRepository.findUserById(payload.sub);
    if (!user || user.status !== PORTAL_USER_STATUSES.ACTIVE)
      throw new UnauthorizedError('Portal access is no longer active', {
        code: ERROR_CODES.PORTAL_ACCESS_REVOKED,
      });
    return this.issueSession(payload.sub, context, payload.fid, nextId);
  }

  async loadAuthenticated(userId: string, sessionId: string): Promise<AuthenticatedPortalUser> {
    const [user, usable] = await Promise.all([
      portalRepository.findUserById(userId),
      portalRepository.sessionUsable(sessionId),
    ]);
    if (!user || !usable || user.status !== PORTAL_USER_STATUSES.ACTIVE)
      throw new UnauthorizedError('Portal session is no longer valid', {
        code: ERROR_CODES.SESSION_REVOKED,
      });
    const clinic = await clinicRepository.findById(user.clinicId.toString());
    if (!clinic || clinic.status !== 'ACTIVE')
      throw new UnauthorizedError('Portal access is no longer available');
    return {
      id: userId,
      sessionId,
      clinicId: user.clinicId.toString(),
      guardianId: user.guardianId.toString(),
      email: user.email,
    };
  }

  async me(user: AuthenticatedPortalUser) {
    const [record, guardian, clinic] = await Promise.all([
      portalRepository.findUserById(user.id),
      guardianRepository.findByIdInClinic(user.guardianId, user.clinicId),
      clinicRepository.findById(user.clinicId),
    ]);
    if (!record || !guardian || !clinic)
      throw new UnauthorizedError('Portal access is no longer available');
    return portalProfile(record, guardian, clinic);
  }

  async logout(userId: string, sessionId: string, all: boolean): Promise<void> {
    if (all) await portalRepository.revokeAll(userId, PORTAL_SESSION_REVOKE_REASONS.LOGOUT_ALL);
    else await portalRepository.revokeSession(sessionId, PORTAL_SESSION_REVOKE_REASONS.LOGOUT);
    await auditLogService.recordSafe({
      actorPortalUserId: userId,
      actorKind: 'PORTAL',
      action: AUDIT_ACTIONS.PORTAL_LOGOUT,
      resourceType: AUDIT_RESOURCE_TYPES.PORTAL_SESSION,
      resourceId: all ? null : sessionId,
      metadata: { allDevices: all },
    });
  }
  async revoke(
    clinicId: string,
    guardianId: string,
    actorUserId: string,
    reason: string,
  ): Promise<void> {
    const user = await portalRepository.revokeUser(clinicId, guardianId, actorUserId, reason);
    await portalRepository.revokeInvitations(clinicId, guardianId);
    if (user)
      await portalRepository.revokeAll(
        user._id.toString(),
        PORTAL_SESSION_REVOKE_REASONS.CLINIC_REVOKED,
      );
    await auditLogService.recordSafe({
      clinicId,
      actorUserId,
      actorKind: 'STAFF',
      action: AUDIT_ACTIONS.PORTAL_ACCESS_REVOKED,
      resourceType: AUDIT_RESOURCE_TYPES.GUARDIAN,
      resourceId: guardianId,
      metadata: { reason },
    });
  }

  private async issueSession(
    userId: string,
    context: PortalRequestContext,
    familyId: string = randomUUID(),
    sessionId: string = new Types.ObjectId().toString(),
  ): Promise<PortalTokensDto> {
    const refreshToken = portalTokenService.signRefreshToken(userId, sessionId, familyId);
    const accessToken = portalTokenService.signAccessToken(userId, sessionId);
    await portalRepository.createSession({
      sessionId,
      portalUserId: userId,
      familyId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + portalTokenService.refreshTokenTtlSeconds * 1000),
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: portalTokenService.accessTokenTtlSeconds,
    };
  }
  private async getDummyHash(): Promise<string> {
    this.dummyHash ??= passwordService.hash('portal-timing-equalizer-value');
    return this.dummyHash;
  }
}
export const portalAuthService = new PortalAuthService();

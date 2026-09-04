import { ERROR_CODES } from '../../common/constants/error-codes.js';
import {
  CLINIC_ROLES,
  MEMBERSHIP_STATUSES,
  type ClinicRole,
} from '../../common/constants/roles.js';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../common/errors/app-error.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import type { MutationContext } from '../../common/utils/request-context.js';
import { toPaginationParams } from '../../common/utils/pagination.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { env } from '../../config/env.js';
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
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import type { SafeUserRecord } from '../users/user.types.js';
import { toMembershipDto } from './membership.mapper.js';
import { membershipRepository, type MembershipRepository } from './membership.repository.js';
import type {
  MembershipDto,
  MembershipListFilters,
  UpdateMembershipInput,
} from './membership.types.js';

function formatRoleName(role: ClinicRole): string {
  switch (role) {
    case CLINIC_ROLES.CLINIC_OWNER:
      return 'Responsable du cabinet / Titulaire';
    case CLINIC_ROLES.ORTHODONTIST:
      return 'Orthodontiste';
    case CLINIC_ROLES.DENTIST:
      return 'Chirurgien-dentiste';
    case CLINIC_ROLES.SECRETARY:
      return 'Secrétaire médicale & Accueil';
    case CLINIC_ROLES.ASSISTANT:
      return 'Assistante dentaire';
    default:
      return role;
  }
}

export interface AddMemberInput {
  email: string;
  role: ClinicRole;
  /** Required only when the email does not belong to an existing account. */
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  password?: string;
}

export class MembershipService {
  constructor(
    private readonly memberships: MembershipRepository = membershipRepository,
    private readonly users: UserRepository = userRepository,
    private readonly clinics: ClinicRepository = clinicRepository,
    private readonly passwords: PasswordService = passwordService,
    private readonly audit: AuditLogService = auditLogService,
    private readonly emails: EmailServiceContract = emailService,
  ) {}

  async list(
    clinicId: string,
    filters: MembershipListFilters,
    page: { page?: number; limit?: number },
  ): Promise<{ result: PaginatedResult<MembershipDto>; pagination: PaginationParams }> {
    const pagination = toPaginationParams(page);
    const { items, total } = await this.memberships.listByClinic(clinicId, filters, pagination);

    const users = await this.users.findManyByIds(items.map((item) => item.userId.toString()));
    const usersById = new Map<string, SafeUserRecord>(
      users.map((user) => [user._id.toString(), user]),
    );

    return {
      result: {
        items: items.map((item) => toMembershipDto(item, usersById.get(item.userId.toString()))),
        total,
      },
      pagination,
    };
  }

  /**
   * Adds someone to the clinic, creating their platform account if they do not
   * have one yet.
   *
   * Re-adding a former colleague reactivates their existing membership rather
   * than inserting a second row, so the history of that person at that clinic
   * stays in one place.
   */
  async addMember(
    clinicId: string,
    input: AddMemberInput,
    context: MutationContext,
  ): Promise<MembershipDto> {
    const email = input.email.toLowerCase();
    const existingUser = await this.users.findByEmail(email);

    if (existingUser) {
      return this.attachExistingUser(clinicId, existingUser, input.role, context);
    }

    if (!input.firstName || !input.lastName || !input.password) {
      throw new BusinessRuleError(
        'This email has no account yet. Provide firstName, lastName and password to create one.',
        { code: ERROR_CODES.USER_NOT_FOUND },
      );
    }

    const passwordHash = await this.passwords.hash(input.password);
    const { membership, user } = await withTransaction(async (session) => {
      const createdUser = await this.users.create(
        {
          email,
          passwordHash,
          firstName: input.firstName as string,
          lastName: input.lastName as string,
          phone: input.phone ?? null,
          emailVerifiedAt: null,
        },
        session,
      );

      const createdMembership = await this.memberships.create(
        {
          userId: createdUser._id.toString(),
          clinicId,
          role: input.role,
          status: MEMBERSHIP_STATUSES.ACTIVE,
          invitedBy: context.actorUserId,
        },
        session,
      );

      await this.audit.record(
        {
          clinicId,
          actorUserId: context.actorUserId,
          action: AUDIT_ACTIONS.MEMBERSHIP_CREATED,
          resourceType: AUDIT_RESOURCE_TYPES.MEMBERSHIP,
          resourceId: createdMembership._id.toString(),
          metadata: { role: input.role, createdAccount: true },
          ip: context.ip,
          userAgent: context.userAgent,
        },
        session,
      );

      return { membership: createdMembership, user: createdUser };
    });

    // Send invitation email to the newly invited team member
    try {
      const [clinic, actor] = await Promise.all([
        this.clinics.findById(clinicId),
        this.users.findById(context.actorUserId),
      ]);
      const clinicName = clinic?.name ?? 'Cabinet Dentaire';
      const invitedByName = actor
        ? `${actor.firstName} ${actor.lastName}`
        : 'Le responsable du cabinet';

      await this.emails.sendStaffInvitation?.({
        recipient: email,
        recipientName: `${user.firstName} ${user.lastName}`,
        clinicName,
        invitedByName,
        roleName: formatRoleName(input.role),
        isNewAccount: true,
        temporaryPassword: input.password,
        loginUrl: `${env.FRONTEND_URL}/login`,
      });
    } catch {
      // Best-effort notification delivery
    }

    return toMembershipDto(membership, user);
  }

  async updateMember(
    clinicId: string,
    membershipId: string,
    changes: UpdateMembershipInput,
    context: MutationContext,
  ): Promise<MembershipDto> {
    const existing = await this.memberships.findByIdInClinic(membershipId, clinicId);
    if (!existing) {
      throw new NotFoundError('Membership not found', {
        code: ERROR_CODES.MEMBERSHIP_NOT_FOUND,
      });
    }

    if (existing.userId.toString() === context.actorUserId) {
      // Prevents both accidental self-lockout and self-promotion.
      throw new ForbiddenError('You cannot change your own membership', {
        code: ERROR_CODES.FORBIDDEN,
      });
    }

    await this.assertClinicKeepsAnOwner(clinicId, existing.role, changes);

    const updated = await this.memberships.update(membershipId, clinicId, changes);
    if (!updated) {
      throw new NotFoundError('Membership not found', {
        code: ERROR_CODES.MEMBERSHIP_NOT_FOUND,
      });
    }

    if (changes.role !== undefined && changes.role !== existing.role) {
      await this.audit.record({
        clinicId,
        actorUserId: context.actorUserId,
        action: AUDIT_ACTIONS.MEMBERSHIP_ROLE_CHANGED,
        resourceType: AUDIT_RESOURCE_TYPES.MEMBERSHIP,
        resourceId: membershipId,
        metadata: {
          from: existing.role,
          to: changes.role,
          targetUserId: existing.userId.toString(),
        },
        ip: context.ip,
        userAgent: context.userAgent,
      });
    }

    if (changes.status !== undefined && changes.status !== existing.status) {
      await this.audit.record({
        clinicId,
        actorUserId: context.actorUserId,
        action: AUDIT_ACTIONS.MEMBERSHIP_STATUS_CHANGED,
        resourceType: AUDIT_RESOURCE_TYPES.MEMBERSHIP,
        resourceId: membershipId,
        metadata: {
          from: existing.status,
          to: changes.status,
          targetUserId: existing.userId.toString(),
        },
        ip: context.ip,
        userAgent: context.userAgent,
      });
    }

    return toMembershipDto(updated);
  }

  /**
   * Removes someone from the clinic.
   *
   * A soft status change, never a delete: the person's name still appears on
   * past appointments and cash records, and those references must stay
   * resolvable years later.
   */
  async removeMember(
    clinicId: string,
    membershipId: string,
    context: MutationContext,
  ): Promise<MembershipDto> {
    return this.updateMember(
      clinicId,
      membershipId,
      { status: MEMBERSHIP_STATUSES.REMOVED },
      context,
    );
  }

  private async attachExistingUser(
    clinicId: string,
    user: SafeUserRecord,
    role: ClinicRole,
    context: MutationContext,
  ): Promise<MembershipDto> {
    const userId = user._id.toString();
    const existing = await this.memberships.findByUserAndClinic(userId, clinicId);

    if (existing && existing.status === MEMBERSHIP_STATUSES.ACTIVE) {
      throw new ConflictError('This person is already a member of the clinic', {
        code: ERROR_CODES.MEMBERSHIP_ALREADY_EXISTS,
      });
    }

    const membership = existing
      ? await this.memberships.update(existing._id.toString(), clinicId, {
          role,
          status: MEMBERSHIP_STATUSES.ACTIVE,
        })
      : await this.memberships.create({
          userId,
          clinicId,
          role,
          status: MEMBERSHIP_STATUSES.ACTIVE,
          invitedBy: context.actorUserId,
        });

    if (!membership) {
      throw new NotFoundError('Membership not found', {
        code: ERROR_CODES.MEMBERSHIP_NOT_FOUND,
      });
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.MEMBERSHIP_CREATED,
      resourceType: AUDIT_RESOURCE_TYPES.MEMBERSHIP,
      resourceId: membership._id.toString(),
      metadata: { role, createdAccount: false, reactivated: existing !== null },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    try {
      const [clinic, actor] = await Promise.all([
        this.clinics.findById(clinicId),
        this.users.findById(context.actorUserId),
      ]);
      const clinicName = clinic?.name ?? 'Cabinet Dentaire';
      const invitedByName = actor
        ? `${actor.firstName} ${actor.lastName}`
        : 'Le responsable du cabinet';

      await this.emails.sendStaffInvitation?.({
        recipient: user.email,
        recipientName: `${user.firstName} ${user.lastName}`,
        clinicName,
        invitedByName,
        roleName: formatRoleName(role),
        isNewAccount: false,
        loginUrl: `${env.FRONTEND_URL}/login`,
      });
    } catch {
      // Best-effort notification delivery
    }

    return toMembershipDto(membership, user);
  }

  /**
   * A clinic must always have at least one active owner, otherwise nobody can
   * manage staff or billing and the tenant becomes unrecoverable through the API.
   */
  private async assertClinicKeepsAnOwner(
    clinicId: string,
    currentRole: ClinicRole,
    changes: UpdateMembershipInput,
  ): Promise<void> {
    if (currentRole !== CLINIC_ROLES.CLINIC_OWNER) {
      return;
    }

    const losesOwnership =
      (changes.role !== undefined && changes.role !== CLINIC_ROLES.CLINIC_OWNER) ||
      (changes.status !== undefined && changes.status !== MEMBERSHIP_STATUSES.ACTIVE);

    if (!losesOwnership) {
      return;
    }

    const activeOwners = await this.memberships.countActiveOwners(clinicId);
    if (activeOwners <= 1) {
      throw new BusinessRuleError(
        'A clinic must keep at least one active owner. Promote another member first.',
        { code: ERROR_CODES.LAST_CLINIC_OWNER },
      );
    }
  }
}

export const membershipService = new MembershipService();

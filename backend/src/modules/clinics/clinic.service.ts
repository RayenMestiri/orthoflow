import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import type { AuthenticatedUser } from '../../common/types/auth.types.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { toClinicDto } from './clinic.mapper.js';
import { clinicRepository, type ClinicRepository } from './clinic.repository.js';
import type { ClinicDto, UpdateClinicInput } from './clinic.types.js';

export interface ClinicMutationContext {
  actorUserId: string;
  ip: string | null;
  userAgent: string | null;
}

export class ClinicService {
  constructor(
    private readonly clinics: ClinicRepository = clinicRepository,
    private readonly audit: AuditLogService = auditLogService,
  ) {}

  async getById(clinicId: string): Promise<ClinicDto> {
    const clinic = await this.clinics.findById(clinicId);
    if (!clinic) {
      throw new NotFoundError('Clinic not found', { code: ERROR_CODES.CLINIC_NOT_FOUND });
    }
    return toClinicDto(clinic);
  }

  /**
   * The clinics the caller may switch between.
   *
   * Derived from their memberships, never from a client-supplied list — this is
   * the endpoint a front-end uses to build its clinic switcher, so it defines
   * what the user is even able to ask for afterwards.
   */
  async listForUser(user: AuthenticatedUser): Promise<ClinicDto[]> {
    const clinicIds = user.memberships.map((membership) => membership.clinicId);
    const clinics = await this.clinics.findManyByIds(clinicIds);
    return clinics.map(toClinicDto);
  }

  async update(
    clinicId: string,
    changes: UpdateClinicInput,
    context: ClinicMutationContext,
  ): Promise<ClinicDto> {
    const updated = await this.clinics.update(clinicId, changes);
    if (!updated) {
      throw new NotFoundError('Clinic not found', { code: ERROR_CODES.CLINIC_NOT_FOUND });
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.CLINIC_UPDATED,
      resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
      resourceId: clinicId,
      // Field names only: an audit trail records *what* changed, and does not
      // become a second copy of the data.
      metadata: { fields: Object.keys(changes) },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return toClinicDto(updated);
  }
}

export const clinicService = new ClinicService();

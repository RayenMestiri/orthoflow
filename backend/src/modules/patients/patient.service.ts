import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { BusinessRuleError, NotFoundError } from '../../common/errors/app-error.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toPaginationParams } from '../../common/utils/pagination.js';
import type { MutationContext } from '../../common/utils/request-context.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { guardianRepository, type GuardianRepository } from '../guardians/guardian.repository.js';
import {
  patientGuardianRepository,
  type PatientGuardianRepository,
} from '../guardians/patient-guardian.repository.js';
import { toPatientDto } from './patient.mapper.js';
import { patientRepository, type PatientRepository } from './patient.repository.js';
import type {
  CreatePatientInput,
  PatientDto,
  PatientListFilters,
  UpdatePatientInput,
} from './patient.types.js';

/**
 * Patient use cases.
 *
 * Note the shape of every method: `clinicId` is the first parameter and comes
 * from the request's verified tenant context. Nothing here accepts a clinic id
 * from a payload, which is what makes cross-tenant access structurally hard
 * rather than a matter of remembering to check.
 */
export class PatientService {
  constructor(
    private readonly patients: PatientRepository = patientRepository,
    private readonly audit: AuditLogService = auditLogService,
    private readonly guardians: GuardianRepository = guardianRepository,
    private readonly patientGuardians: PatientGuardianRepository = patientGuardianRepository,
  ) {}

  async list(
    clinicId: string,
    filters: PatientListFilters,
    page: { page?: number; limit?: number },
  ): Promise<{ result: PaginatedResult<PatientDto>; pagination: PaginationParams }> {
    const pagination = toPaginationParams(page);
    const { items, total } = await this.patients.listByClinic(clinicId, filters, pagination);
    const relationships = await this.patientGuardians.listPrimaryByPatientIds(
      items.map((item) => item._id.toString()),
      clinicId,
    );
    const guardians = await this.guardians.findManyByIdsInClinic(
      relationships.map((relationship) => relationship.guardianId.toString()),
      clinicId,
    );
    const guardiansById = new Map(guardians.map((guardian) => [guardian._id.toString(), guardian]));
    const relationshipByPatient = new Map(
      relationships.map((relationship) => [relationship.patientId.toString(), relationship]),
    );
    return {
      result: {
        items: items.map((item) => {
          const relationship = relationshipByPatient.get(item._id.toString());
          const guardian = relationship
            ? guardiansById.get(relationship.guardianId.toString())
            : undefined;
          return toPatientDto(
            item,
            relationship && guardian
              ? {
                  id: guardian._id.toString(),
                  fullName: `${guardian.firstName} ${guardian.lastName}`.trim(),
                  relationship: relationship.relationship,
                }
              : null,
          );
        }),
        total,
      },
      pagination,
    };
  }

  async getById(clinicId: string, patientId: string): Promise<PatientDto> {
    const patient = await this.patients.findByIdInClinic(patientId, clinicId);
    if (!patient) {
      // Same 404 whether the patient does not exist or belongs to another
      // clinic — the API must not confirm that an id exists elsewhere.
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }
    return toPatientDto(patient);
  }

  async create(
    clinicId: string,
    input: Omit<CreatePatientInput, 'clinicId' | 'createdBy'>,
    context: MutationContext,
  ): Promise<PatientDto> {
    const patient = await this.patients.create({
      ...input,
      clinicId,
      createdBy: context.actorUserId,
    });

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.PATIENT_CREATED,
      resourceType: AUDIT_RESOURCE_TYPES.PATIENT,
      resourceId: patient._id.toString(),
      metadata: {},
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return toPatientDto(patient);
  }

  async update(
    clinicId: string,
    patientId: string,
    changes: UpdatePatientInput,
    context: MutationContext,
  ): Promise<PatientDto> {
    const updated = await this.patients.update(patientId, clinicId, changes);
    if (!updated) {
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.PATIENT_UPDATED,
      resourceType: AUDIT_RESOURCE_TYPES.PATIENT,
      resourceId: patientId,
      // Field names only — the audit trail is not a shadow copy of patient data.
      metadata: { fields: Object.keys(changes) },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return toPatientDto(updated);
  }

  /**
   * Archives a patient. There is no delete endpoint, by design: a patient record
   * is the anchor for treatments and cash records that must remain auditable.
   */
  async archive(
    clinicId: string,
    patientId: string,
    context: MutationContext,
  ): Promise<PatientDto> {
    const archived = await this.patients.archive(patientId, clinicId, context.actorUserId);

    if (!archived) {
      const existing = await this.patients.findByIdInClinic(patientId, clinicId);
      if (!existing) {
        throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
      }
      throw new BusinessRuleError('This patient is already archived', {
        code: ERROR_CODES.PATIENT_ALREADY_ARCHIVED,
      });
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.PATIENT_ARCHIVED,
      resourceType: AUDIT_RESOURCE_TYPES.PATIENT,
      resourceId: patientId,
      metadata: {},
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return toPatientDto(archived);
  }

  async restore(
    clinicId: string,
    patientId: string,
    context: MutationContext,
  ): Promise<PatientDto> {
    const restored = await this.patients.restore(patientId, clinicId);
    if (!restored) {
      throw new NotFoundError('No archived patient found with this id', {
        code: ERROR_CODES.PATIENT_NOT_FOUND,
      });
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.PATIENT_RESTORED,
      resourceType: AUDIT_RESOURCE_TYPES.PATIENT,
      resourceId: patientId,
      metadata: {},
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return toPatientDto(restored);
  }
}

export const patientService = new PatientService();

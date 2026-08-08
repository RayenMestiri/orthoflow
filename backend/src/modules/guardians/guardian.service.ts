import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import type { MutationContext } from '../../common/utils/request-context.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { patientRepository, type PatientRepository } from '../patients/patient.repository.js';
import { toGuardianDto } from './guardian.mapper.js';
import { guardianRepository, type GuardianRepository } from './guardian.repository.js';
import {
  CONTACT_PREFERENCES,
  type CreateGuardianInput,
  type GuardianDto,
  type UpdateGuardianInput,
} from './guardian.types.js';
import {
  patientGuardianRepository,
  type PatientGuardianRepository,
} from './patient-guardian.repository.js';

export class GuardianService {
  constructor(
    private readonly patients: PatientRepository = patientRepository,
    private readonly guardians: GuardianRepository = guardianRepository,
    private readonly relationships: PatientGuardianRepository = patientGuardianRepository,
    private readonly audit: AuditLogService = auditLogService,
  ) {}

  async listForPatient(clinicId: string, patientId: string): Promise<GuardianDto[]> {
    await this.assertPatient(clinicId, patientId);
    const relationships = await this.relationships.listByPatient(patientId, clinicId);
    const guardians = await this.guardians.findManyByIdsInClinic(
      relationships.map((relationship) => relationship.guardianId.toString()),
      clinicId,
    );
    const guardiansById = new Map(guardians.map((guardian) => [guardian._id.toString(), guardian]));
    return relationships.flatMap((relationship) => {
      const guardian = guardiansById.get(relationship.guardianId.toString());
      return guardian ? [toGuardianDto(guardian, relationship)] : [];
    });
  }

  async createForPatient(
    clinicId: string,
    patientId: string,
    input: CreateGuardianInput,
    context: MutationContext,
  ): Promise<GuardianDto> {
    await this.assertPatient(clinicId, patientId);
    return withTransaction(async (session) => {
      if (input.isPrimary) {
        await this.relationships.clearPrimary(patientId, clinicId, session);
      }
      const guardian = await this.guardians.create(clinicId, context.actorUserId, input, session);
      const relationship = await this.relationships.create(
        {
          clinicId,
          patientId,
          guardianId: guardian._id.toString(),
          createdBy: context.actorUserId,
          relationship: input.relationship,
          isPrimary: input.isPrimary ?? false,
          financiallyResponsible: input.financiallyResponsible ?? false,
          contactPreference: input.contactPreference ?? CONTACT_PREFERENCES.NO_PREFERENCE,
        },
        session,
      );
      await this.audit.record(
        {
          clinicId,
          actorUserId: context.actorUserId,
          action: AUDIT_ACTIONS.GUARDIAN_CREATED,
          resourceType: AUDIT_RESOURCE_TYPES.GUARDIAN,
          resourceId: guardian._id.toString(),
          metadata: {},
          ip: context.ip,
          userAgent: context.userAgent,
        },
        session,
      );
      await this.audit.record(
        {
          clinicId,
          actorUserId: context.actorUserId,
          action: AUDIT_ACTIONS.GUARDIAN_LINKED,
          resourceType: AUDIT_RESOURCE_TYPES.PATIENT,
          resourceId: patientId,
          metadata: { guardianId: guardian._id.toString(), relationship: input.relationship },
          ip: context.ip,
          userAgent: context.userAgent,
        },
        session,
      );
      return toGuardianDto(guardian, relationship);
    });
  }

  async updateForPatient(
    clinicId: string,
    patientId: string,
    guardianId: string,
    changes: UpdateGuardianInput,
    context: MutationContext,
  ): Promise<GuardianDto> {
    await this.assertPatient(clinicId, patientId);
    const existingRelationship = await this.relationships.findByPatientAndGuardian(
      patientId,
      guardianId,
      clinicId,
    );
    const [existingGuardian] = await this.guardians.findManyByIdsInClinic([guardianId], clinicId);
    if (!existingRelationship || !existingGuardian) {
      throw new NotFoundError('Guardian not found for this patient', {
        code: ERROR_CODES.GUARDIAN_NOT_FOUND,
      });
    }

    return withTransaction(async (session) => {
      if (changes.isPrimary) {
        await this.relationships.clearPrimary(patientId, clinicId, session);
      }
      const identityChanges = {
        ...(changes.firstName === undefined ? {} : { firstName: changes.firstName }),
        ...(changes.lastName === undefined ? {} : { lastName: changes.lastName }),
        ...(changes.phone === undefined ? {} : { phone: changes.phone }),
        ...(changes.email === undefined ? {} : { email: changes.email }),
      };
      const linkChanges = {
        ...(changes.relationship === undefined ? {} : { relationship: changes.relationship }),
        ...(changes.isPrimary === undefined ? {} : { isPrimary: changes.isPrimary }),
        ...(changes.financiallyResponsible === undefined
          ? {}
          : { financiallyResponsible: changes.financiallyResponsible }),
        ...(changes.contactPreference === undefined
          ? {}
          : { contactPreference: changes.contactPreference }),
      };
      const guardian =
        Object.keys(identityChanges).length > 0
          ? await this.guardians.updateInClinic(guardianId, clinicId, identityChanges, session)
          : existingGuardian;
      const relationship =
        Object.keys(linkChanges).length > 0
          ? await this.relationships.update(patientId, guardianId, clinicId, linkChanges, session)
          : existingRelationship;
      if (!guardian || !relationship) {
        throw new NotFoundError('Guardian not found for this patient', {
          code: ERROR_CODES.GUARDIAN_NOT_FOUND,
        });
      }
      await this.audit.record(
        {
          clinicId,
          actorUserId: context.actorUserId,
          action: AUDIT_ACTIONS.GUARDIAN_UPDATED,
          resourceType: AUDIT_RESOURCE_TYPES.PATIENT,
          resourceId: patientId,
          metadata: { guardianId, fields: Object.keys(changes) },
          ip: context.ip,
          userAgent: context.userAgent,
        },
        session,
      );
      return toGuardianDto(guardian, relationship);
    });
  }

  private async assertPatient(clinicId: string, patientId: string): Promise<void> {
    const patient = await this.patients.findByIdInClinic(patientId, clinicId);
    if (!patient) {
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }
  }
}

export const guardianService = new GuardianService();

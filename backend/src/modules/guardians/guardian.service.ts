import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import type { MutationContext } from '../../common/utils/request-context.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { patientRepository, type PatientRepository } from '../patients/patient.repository.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import { toGuardianDto } from './guardian.mapper.js';
import { guardianRepository, type GuardianRepository } from './guardian.repository.js';
import {
  CONTACT_PREFERENCES,
  type CreateGuardianInput,
  type GuardianChildDto,
  type GuardianDto,
  type GuardianSearchDto,
  type LinkExistingGuardianInput,
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
    private readonly users: UserRepository = userRepository,
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
    if (input.email) {
      const normalizedEmail = input.email.trim().toLowerCase();
      const staffUser = await this.users.findByEmail(normalizedEmail);
      if (staffUser) {
        throw new ConflictError(
          'Cet email est déjà utilisé par un compte professionnel du cabinet. Veuillez renseigner une adresse email distincte pour le tuteur / parent.',
          { code: ERROR_CODES.EMAIL_ALREADY_REGISTERED },
        );
      }
      const existingInClinic = await this.guardians.findByEmailInClinic(normalizedEmail, clinicId);
      if (existingInClinic) {
        throw new ConflictError(
          'Un tuteur avec cette adresse email existe déjà dans la clinique. Veuillez lier le tuteur existant.',
          { code: ERROR_CODES.EMAIL_ALREADY_REGISTERED },
        );
      }
    }
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
          communicationAuthorized: input.communicationAuthorized ?? false,
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

  async linkExistingToPatient(
    clinicId: string,
    patientId: string,
    input: LinkExistingGuardianInput,
    context: MutationContext,
  ): Promise<GuardianDto> {
    await this.assertPatient(clinicId, patientId);
    const guardian = await this.guardians.findByIdInClinic(input.guardianId, clinicId);
    if (!guardian) {
      throw new NotFoundError('Guardian not found in this clinic', {
        code: ERROR_CODES.GUARDIAN_NOT_FOUND,
      });
    }

    const existingRelationship = await this.relationships.findByPatientAndGuardian(
      patientId,
      input.guardianId,
      clinicId,
    );
    if (existingRelationship) {
      throw new ConflictError('This guardian is already linked to this patient');
    }

    return withTransaction(async (session) => {
      if (input.isPrimary) {
        await this.relationships.clearPrimary(patientId, clinicId, session);
      }
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
          communicationAuthorized: input.communicationAuthorized ?? false,
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

    if (changes.email) {
      const normalizedEmail = changes.email.trim().toLowerCase();
      const staffUser = await this.users.findByEmail(normalizedEmail);
      if (staffUser) {
        throw new ConflictError(
          'Cet email est déjà utilisé par un compte professionnel du cabinet. Veuillez renseigner une adresse email distincte pour le tuteur / parent.',
          { code: ERROR_CODES.EMAIL_ALREADY_REGISTERED },
        );
      }
      const existingInClinic = await this.guardians.findByEmailInClinic(normalizedEmail, clinicId);
      if (existingInClinic && existingInClinic._id.toString() !== guardianId) {
        throw new ConflictError(
          'Un tuteur avec cette adresse email existe déjà dans la clinique. Veuillez lier le tuteur existant.',
          { code: ERROR_CODES.EMAIL_ALREADY_REGISTERED },
        );
      }
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
        ...(changes.communicationAuthorized === undefined
          ? {}
          : { communicationAuthorized: changes.communicationAuthorized }),
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

  async makePrimary(
    clinicId: string,
    patientId: string,
    guardianId: string,
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
      await this.relationships.clearPrimary(patientId, clinicId, session);
      const relationship = await this.relationships.update(
        patientId,
        guardianId,
        clinicId,
        { isPrimary: true },
        session,
      );
      if (!relationship) {
        throw new NotFoundError('Guardian relationship update failed', {
          code: ERROR_CODES.GUARDIAN_NOT_FOUND,
        });
      }
      await this.audit.record(
        {
          clinicId,
          actorUserId: context.actorUserId,
          action: AUDIT_ACTIONS.PRIMARY_GUARDIAN_CHANGED,
          resourceType: AUDIT_RESOURCE_TYPES.PATIENT,
          resourceId: patientId,
          metadata: { guardianId },
          ip: context.ip,
          userAgent: context.userAgent,
        },
        session,
      );
      return toGuardianDto(existingGuardian, relationship);
    });
  }

  async unlinkFromPatient(
    clinicId: string,
    patientId: string,
    guardianId: string,
    context: MutationContext,
  ): Promise<void> {
    await this.assertPatient(clinicId, patientId);
    const existingRelationship = await this.relationships.findByPatientAndGuardian(
      patientId,
      guardianId,
      clinicId,
    );
    if (!existingRelationship) {
      throw new NotFoundError('Guardian not found for this patient', {
        code: ERROR_CODES.GUARDIAN_NOT_FOUND,
      });
    }

    await withTransaction(async (session) => {
      await this.relationships.unlink(patientId, guardianId, clinicId, session);
      await this.audit.record(
        {
          clinicId,
          actorUserId: context.actorUserId,
          action: AUDIT_ACTIONS.GUARDIAN_UNLINKED,
          resourceType: AUDIT_RESOURCE_TYPES.PATIENT,
          resourceId: patientId,
          metadata: { guardianId },
          ip: context.ip,
          userAgent: context.userAgent,
        },
        session,
      );
    });
  }

  async getGuardianChildren(clinicId: string, guardianId: string): Promise<GuardianChildDto[]> {
    const guardian = await this.guardians.findByIdInClinic(guardianId, clinicId);
    if (!guardian) {
      throw new NotFoundError('Guardian not found in this clinic', {
        code: ERROR_CODES.GUARDIAN_NOT_FOUND,
      });
    }

    const relationships = await this.relationships.listSiblingsByGuardian(guardianId, clinicId);
    if (relationships.length === 0) return [];

    const patientIds = relationships.map((rel) => rel.patientId.toString());
    const patients = await this.patients.findManyByIdsInClinic(patientIds, clinicId);
    const patientsById = new Map(patients.map((p) => [p._id.toString(), p]));

    return relationships.flatMap((rel) => {
      const patient = patientsById.get(rel.patientId.toString());
      if (!patient) return [];
      return [
        {
          patientId: patient._id.toString(),
          fullName: `${patient.firstName} ${patient.lastName}`.trim(),
          referenceNumber: patient.referenceNumber ?? null,
          birthDate: patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : null,
          relationship: rel.relationship,
          isPrimary: rel.isPrimary,
        },
      ];
    });
  }

  async searchGuardians(clinicId: string, query: string): Promise<GuardianSearchDto[]> {
    const guardians = await this.guardians.searchInClinic(clinicId, query, 20);
    const results = await Promise.all(
      guardians.map(async (g) => {
        const count = await this.relationships.countByGuardianInClinic(g._id.toString(), clinicId);
        return {
          id: g._id.toString(),
          firstName: g.firstName,
          lastName: g.lastName,
          fullName: `${g.firstName} ${g.lastName}`.trim(),
          phone: g.phone ?? null,
          email: g.email ?? null,
          linkedPatientsCount: count,
        };
      }),
    );
    return results;
  }

  private async assertPatient(clinicId: string, patientId: string): Promise<void> {
    const patient = await this.patients.findByIdInClinic(patientId, clinicId);
    if (!patient) {
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }
  }
}

export const guardianService = new GuardianService();

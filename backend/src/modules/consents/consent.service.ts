import { createHash } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '../audit-logs/audit-log.types.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from '../../common/errors/app-error.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { logger } from '../../config/logger.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import {
  MEDIA_SCOPES,
  mediaService,
  type MediaService,
} from '../../infrastructure/cloudinary/media.service.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import { guardianRepository, type GuardianRepository } from '../guardians/guardian.repository.js';
import {
  patientGuardianRepository,
  type PatientGuardianRepository,
} from '../guardians/patient-guardian.repository.js';
import { patientRepository, type PatientRepository } from '../patients/patient.repository.js';
import { retentionRepository, type RetentionRepository } from '../retention/retention.repository.js';
import { treatmentRepository, type TreatmentRepository } from '../treatments/treatment.repository.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import { toConsentTemplateDto, toSignedConsentDto } from './consent.mapper.js';
import { consentPdfService, type ConsentPdfService } from './consent-pdf.service.js';
import {
  assertSafeConsentTemplate,
  renderConsentTemplate,
  type ConsentPlaceholderValues,
} from './consent-placeholders.js';
import {
  consentTemplateRepository,
  signedConsentRepository,
  type ConsentTemplateListFilters,
  type ConsentTemplateRepository,
  type SignedConsentRepository,
} from './consent.repository.js';
import {
  CONSENT_SIGNER_TYPES,
  CONSENT_TEMPLATE_STATUSES,
  SIGNED_CONSENT_STATUSES,
  type ConsentMutationContext,
  type ConsentPreviewDto,
  type ConsentSignatureFile,
  type ConsentSigningInput,
  type ConsentTemplateDto,
  type ConsentTemplateRecord,
  type CreateConsentTemplateInput,
  type SignedConsentDto,
  type SignedConsentRecord,
  type UpdateConsentTemplateInput,
} from './consent.types.js';

type ConsentStorage = Pick<MediaService, 'isEnabled' | 'upload' | 'remove' | 'download'>;

interface ResolvedConsentSnapshot {
  template: ConsentTemplateRecord;
  patientName: string;
  signerName: string;
  signerRelationship: string | null;
  guardianId: string | null;
  presentedByName: string;
  clinicName: string;
  clinicAddress: string | null;
  clinicPhone: string | null;
  signedAt: Date;
  signedAtLabel: string;
  renderedContent: string;
  treatmentId: string | null;
  retentionPlanId: string | null;
}

function hashBytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function duplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export class ConsentTemplateService {
  constructor(
    private readonly templates: ConsentTemplateRepository = consentTemplateRepository,
    private readonly audit: AuditLogService = auditLogService,
  ) {}

  async list(
    clinicId: string,
    filters: ConsentTemplateListFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ConsentTemplateDto>> {
    const result = await this.templates.list(clinicId, filters, pagination);
    return { items: result.items.map(toConsentTemplateDto), total: result.total };
  }

  async create(
    clinicId: string,
    input: CreateConsentTemplateInput,
    context: ConsentMutationContext,
  ): Promise<ConsentTemplateDto> {
    assertSafeConsentTemplate(input.content);
    if (await this.templates.findLatestByCode(input.code, clinicId)) {
      throw new ConflictError('A consent template with this code already exists', {
        code: ERROR_CODES.CONSENT_TEMPLATE_CODE_TAKEN,
      });
    }
    let created: ConsentTemplateRecord;
    try {
      created = await this.templates.create(clinicId, input, 1, context.actorUserId);
    } catch (error) {
      if (duplicateKey(error)) {
        throw new ConflictError('A consent template with this code already exists', {
          code: ERROR_CODES.CONSENT_TEMPLATE_CODE_TAKEN,
        });
      }
      throw error;
    }
    await this.recordTemplateAudit(AUDIT_ACTIONS.CONSENT_TEMPLATE_CREATED, created, context);
    return toConsentTemplateDto(created);
  }

  async updateDraft(
    clinicId: string,
    templateId: string,
    changes: UpdateConsentTemplateInput,
    context: ConsentMutationContext,
  ): Promise<ConsentTemplateDto> {
    if (changes.content !== undefined) assertSafeConsentTemplate(changes.content);
    const existing = await this.requireTemplate(clinicId, templateId);
    if (existing.status !== CONSENT_TEMPLATE_STATUSES.DRAFT) throw this.notDraft();
    const updated = await this.templates.updateDraft(
      templateId,
      clinicId,
      changes,
      context.actorUserId,
    );
    if (!updated) throw this.notDraft();
    await this.recordTemplateAudit(AUDIT_ACTIONS.CONSENT_TEMPLATE_UPDATED, updated, context, {
      changedFields: Object.keys(changes),
    });
    return toConsentTemplateDto(updated);
  }

  async createVersion(
    clinicId: string,
    sourceTemplateId: string,
    changes: UpdateConsentTemplateInput,
    context: ConsentMutationContext,
  ): Promise<ConsentTemplateDto> {
    const source = await this.requireTemplate(clinicId, sourceTemplateId);
    const latest = await this.templates.findLatestByCode(source.code, clinicId);
    const content = changes.content ?? source.content;
    assertSafeConsentTemplate(content);
    const created = await this.templates.create(
      clinicId,
      {
        code: source.code,
        title: changes.title ?? source.title,
        category: changes.category ?? source.category,
        content,
      },
      (latest?.version ?? source.version) + 1,
      context.actorUserId,
    );
    await this.recordTemplateAudit(AUDIT_ACTIONS.CONSENT_TEMPLATE_VERSION_CREATED, created, context, {
      sourceTemplateId,
    });
    return toConsentTemplateDto(created);
  }

  async activate(
    clinicId: string,
    templateId: string,
    context: ConsentMutationContext,
  ): Promise<ConsentTemplateDto> {
    const existing = await this.requireTemplate(clinicId, templateId);
    if (existing.status !== CONSENT_TEMPLATE_STATUSES.DRAFT) throw this.notDraft();
    assertSafeConsentTemplate(existing.content);
    const activated = await withTransaction(async (session) => {
      const record = await this.templates.activate(existing, context.actorUserId, new Date(), session);
      if (!record) throw this.notDraft();
      await this.recordTemplateAudit(
        AUDIT_ACTIONS.CONSENT_TEMPLATE_VERSION_ACTIVATED,
        record,
        context,
        undefined,
        session,
      );
      return record;
    });
    return toConsentTemplateDto(activated);
  }

  async archive(
    clinicId: string,
    templateId: string,
    context: ConsentMutationContext,
  ): Promise<ConsentTemplateDto> {
    await this.requireTemplate(clinicId, templateId);
    const archived = await this.templates.archive(templateId, clinicId, context.actorUserId, new Date());
    if (!archived) {
      throw new BusinessRuleError('This consent template is already archived', {
        code: ERROR_CODES.CONSENT_TEMPLATE_NOT_DRAFT,
      });
    }
    await this.recordTemplateAudit(AUDIT_ACTIONS.CONSENT_TEMPLATE_ARCHIVED, archived, context);
    return toConsentTemplateDto(archived);
  }

  private async requireTemplate(clinicId: string, templateId: string): Promise<ConsentTemplateRecord> {
    const template = await this.templates.findByIdInClinic(templateId, clinicId);
    if (!template) {
      throw new NotFoundError('Consent template not found', {
        code: ERROR_CODES.CONSENT_TEMPLATE_NOT_FOUND,
      });
    }
    return template;
  }

  private notDraft(): BusinessRuleError {
    return new BusinessRuleError('Only draft consent templates may be changed or activated', {
      code: ERROR_CODES.CONSENT_TEMPLATE_NOT_DRAFT,
    });
  }

  private async recordTemplateAudit(
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
    record: ConsentTemplateRecord,
    context: ConsentMutationContext,
    metadata?: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<void> {
    await this.audit.record(
      {
        clinicId: record.clinicId.toString(),
        actorUserId: context.actorUserId,
        action,
        resourceType: AUDIT_RESOURCE_TYPES.CONSENT_TEMPLATE,
        resourceId: record._id.toString(),
        metadata: { code: record.code, version: record.version, ...metadata },
        ip: context.ip,
        userAgent: context.userAgent,
      },
      session,
    );
  }
}

export class ConsentService {
  constructor(
    private readonly consents: SignedConsentRepository = signedConsentRepository,
    private readonly templates: ConsentTemplateRepository = consentTemplateRepository,
    private readonly patients: PatientRepository = patientRepository,
    private readonly guardians: GuardianRepository = guardianRepository,
    private readonly patientGuardians: PatientGuardianRepository = patientGuardianRepository,
    private readonly clinics: ClinicRepository = clinicRepository,
    private readonly users: UserRepository = userRepository,
    private readonly treatments: TreatmentRepository = treatmentRepository,
    private readonly retention: RetentionRepository = retentionRepository,
    private readonly storage: ConsentStorage = mediaService,
    private readonly pdf: ConsentPdfService = consentPdfService,
    private readonly audit: AuditLogService = auditLogService,
  ) {}

  async listForPatient(
    clinicId: string,
    patientId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<SignedConsentDto>> {
    await this.requirePatient(clinicId, patientId);
    const result = await this.consents.listByPatient(clinicId, patientId, pagination);
    return { items: result.items.map(toSignedConsentDto), total: result.total };
  }

  async getById(clinicId: string, consentId: string): Promise<SignedConsentDto> {
    return toSignedConsentDto(await this.requireConsent(clinicId, consentId));
  }

  async preview(
    clinicId: string,
    patientId: string,
    input: Omit<ConsentSigningInput, 'idempotencyKey' | 'acknowledgement'>,
    context: ConsentMutationContext,
  ): Promise<ConsentPreviewDto> {
    const snapshot = await this.resolveSnapshot(clinicId, patientId, input, context);
    return {
      templateId: snapshot.template._id.toString(),
      templateCode: snapshot.template.code,
      templateVersion: snapshot.template.version,
      versionLabel: `v${snapshot.template.version}`,
      category: snapshot.template.category,
      title: snapshot.template.title,
      renderedContent: snapshot.renderedContent,
      patientName: snapshot.patientName,
      signerType: input.signerType,
      guardianId: snapshot.guardianId,
      signerName: snapshot.signerName,
      signerRelationship: snapshot.signerRelationship,
      presentedByName: snapshot.presentedByName,
      signingDate: snapshot.signedAtLabel,
    };
  }

  async sign(
    clinicId: string,
    patientId: string,
    input: ConsentSigningInput,
    signature: ConsentSignatureFile,
    context: ConsentMutationContext,
  ): Promise<SignedConsentDto> {
    const signatureSha = hashBytes(signature.content);
    const payloadDigest = hashPayload({ patientId, ...input, signatureSha });
    const replay = await this.consents.findByIdempotencyKey(input.idempotencyKey, clinicId);
    if (replay) return this.resolveReplay(replay, payloadDigest);

    if (!this.storage.isEnabled()) {
      throw new ServiceUnavailableError('Consent artifact storage is not configured', {
        code: ERROR_CODES.MEDIA_STORAGE_UNAVAILABLE,
      });
    }
    const snapshot = await this.resolveSnapshot(clinicId, patientId, input, context);
    const consentRef = await this.consents.reserveConsentReference(
      clinicId,
      snapshot.signedAt.getUTCFullYear(),
    );
    const signatureStored = await this.storage.upload({
      clinicId,
      scope: MEDIA_SCOPES.CONSENT_ARTIFACTS,
      subfolders: [patientId, consentRef],
      content: signature.content,
      fileName: `${consentRef}-signature.png`,
      mimeType: signature.mimeType,
      deliveryType: 'authenticated',
    });

    let pdfStored: Awaited<ReturnType<ConsentStorage['upload']>> | null = null;
    try {
      const pdfBytes = await this.pdf.generate({
        clinicName: snapshot.clinicName,
        clinicAddress: snapshot.clinicAddress,
        clinicPhone: snapshot.clinicPhone,
        consentRef,
        title: snapshot.template.title,
        templateVersion: snapshot.template.version,
        patientName: snapshot.patientName,
        signerName: snapshot.signerName,
        signerRelationship: snapshot.signerRelationship,
        presentedByName: snapshot.presentedByName,
        signedAtLabel: snapshot.signedAtLabel,
        content: snapshot.renderedContent,
        signaturePng: signature.content,
      });
      const pdfSha = hashBytes(pdfBytes);
      pdfStored = await this.storage.upload({
        clinicId,
        scope: MEDIA_SCOPES.CONSENT_ARTIFACTS,
        subfolders: [patientId, consentRef],
        content: pdfBytes,
        fileName: `${consentRef}.pdf`,
        mimeType: 'application/pdf',
        deliveryType: 'authenticated',
      });

      const created = await withTransaction(async (session) => {
        const record = await this.consents.create(
          {
            clinicId,
            patientId,
            treatmentId: snapshot.treatmentId,
            retentionPlanId: snapshot.retentionPlanId,
            consentRef,
            templateId: snapshot.template._id.toString(),
            templateCode: snapshot.template.code,
            templateVersion: snapshot.template.version,
            category: snapshot.template.category,
            titleSnapshot: snapshot.template.title,
            contentSnapshot: snapshot.renderedContent,
            patientNameSnapshot: snapshot.patientName,
            signerType: input.signerType,
            guardianId: snapshot.guardianId,
            signerNameSnapshot: snapshot.signerName,
            signerRelationshipSnapshot: snapshot.signerRelationship,
            status: SIGNED_CONSENT_STATUSES.SIGNED,
            signedAt: snapshot.signedAt,
            presentedByUserId: context.actorUserId,
            presentedByNameSnapshot: snapshot.presentedByName,
            signatureArtifact: {
              provider: 'CLOUDINARY',
              publicId: signatureStored.publicId,
              resourceType: signatureStored.resourceType,
              deliveryType: 'authenticated',
              mimeType: signature.mimeType,
              byteSize: signatureStored.bytes,
              sha256: signatureSha,
            },
            finalizedPdf: {
              provider: 'CLOUDINARY',
              publicId: pdfStored!.publicId,
              resourceType: pdfStored!.resourceType,
              deliveryType: 'authenticated',
              mimeType: 'application/pdf',
              byteSize: pdfStored!.bytes,
              sha256: pdfSha,
            },
            idempotencyKey: input.idempotencyKey,
            payloadDigest,
            revokedAt: null,
            revocationReason: null,
            voidedAt: null,
            voidReason: null,
          },
          session,
        );
        await this.recordConsentAudit(AUDIT_ACTIONS.CONSENT_SIGNED, record, context, session);
        return record;
      });
      return toSignedConsentDto(created);
    } catch (error) {
      await this.cleanupArtifacts(
        [
          pdfStored ? { publicId: pdfStored.publicId, resourceType: pdfStored.resourceType } : null,
          { publicId: signatureStored.publicId, resourceType: signatureStored.resourceType },
        ].filter((item): item is { publicId: string; resourceType: string } => item !== null),
        clinicId,
      );
      if (duplicateKey(error)) {
        const raced = await this.consents.findByIdempotencyKey(input.idempotencyKey, clinicId);
        if (raced) return this.resolveReplay(raced, payloadDigest);
      }
      throw error;
    }
  }

  async downloadPdf(
    clinicId: string,
    consentId: string,
  ): Promise<{ fileName: string; content: Buffer }> {
    const consent = await this.requireConsent(clinicId, consentId);
    const content = await this.storage.download(
      consent.finalizedPdf.publicId,
      consent.finalizedPdf.resourceType,
      consent.finalizedPdf.deliveryType,
    );
    if (hashBytes(content) !== consent.finalizedPdf.sha256) {
      throw new ServiceUnavailableError('The finalized consent artifact failed its integrity check', {
        code: ERROR_CODES.CONSENT_ARTIFACT_INTEGRITY_FAILED,
      });
    }
    return { fileName: `${consent.consentRef}.pdf`, content };
  }

  async revoke(
    clinicId: string,
    consentId: string,
    reason: string,
    context: ConsentMutationContext,
  ): Promise<SignedConsentDto> {
    const existing = await this.requireConsent(clinicId, consentId);
    if (existing.status !== SIGNED_CONSENT_STATUSES.SIGNED) {
      throw new BusinessRuleError('Only a currently signed consent may be revoked', {
        code:
          existing.status === SIGNED_CONSENT_STATUSES.VOIDED
            ? ERROR_CODES.CONSENT_ALREADY_VOIDED
            : ERROR_CODES.CONSENT_ALREADY_REVOKED,
      });
    }
    const updated = await withTransaction(async (session) => {
      const record = await this.consents.revoke(
        consentId,
        clinicId,
        context.actorUserId,
        reason,
        new Date(),
        session,
      );
      if (!record) throw new ConflictError('Consent status changed; reload and try again');
      await this.recordConsentAudit(AUDIT_ACTIONS.CONSENT_REVOKED, record, context, session);
      return record;
    });
    return toSignedConsentDto(updated);
  }

  async void(
    clinicId: string,
    consentId: string,
    reason: string,
    context: ConsentMutationContext,
  ): Promise<SignedConsentDto> {
    const existing = await this.requireConsent(clinicId, consentId);
    if (existing.status === SIGNED_CONSENT_STATUSES.VOIDED) {
      throw new BusinessRuleError('This consent is already voided', {
        code: ERROR_CODES.CONSENT_ALREADY_VOIDED,
      });
    }
    const updated = await withTransaction(async (session) => {
      const record = await this.consents.void(
        consentId,
        clinicId,
        context.actorUserId,
        reason,
        new Date(),
        session,
      );
      if (!record) throw new ConflictError('Consent status changed; reload and try again');
      await this.recordConsentAudit(AUDIT_ACTIONS.CONSENT_VOIDED, record, context, session);
      return record;
    });
    return toSignedConsentDto(updated);
  }

  private async resolveSnapshot(
    clinicId: string,
    patientId: string,
    input: Pick<ConsentSigningInput, 'templateId' | 'signerType' | 'guardianId' | 'treatmentId' | 'retentionPlanId'>,
    context: ConsentMutationContext,
  ): Promise<ResolvedConsentSnapshot> {
    const [patient, template, clinic, presenter] = await Promise.all([
      this.patients.findByIdInClinic(patientId, clinicId),
      this.templates.findByIdInClinic(input.templateId, clinicId),
      this.clinics.findById(clinicId),
      this.users.findById(context.actorUserId),
    ]);
    if (!patient) throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    if (!template) {
      throw new NotFoundError('Consent template not found', {
        code: ERROR_CODES.CONSENT_TEMPLATE_NOT_FOUND,
      });
    }
    if (template.status !== CONSENT_TEMPLATE_STATUSES.ACTIVE) {
      throw new BusinessRuleError('Only an active consent template may be signed', {
        code: ERROR_CODES.CONSENT_TEMPLATE_NOT_ACTIVE,
      });
    }
    if (!clinic || !presenter) throw new NotFoundError('Clinic context is unavailable');

    const signedAt = new Date();
    const patientName = `${patient.firstName} ${patient.lastName}`.trim();
    let guardianId: string | null = null;
    let guardianName = '';
    let relationship: string | null = null;
    if (input.signerType === CONSENT_SIGNER_TYPES.GUARDIAN) {
      if (!input.guardianId) {
        throw new BusinessRuleError('Select a linked guardian to sign for this patient', {
          code: ERROR_CODES.CONSENT_GUARDIAN_REQUIRED,
        });
      }
      const [link, guardian] = await Promise.all([
        this.patientGuardians.findByPatientAndGuardian(patientId, input.guardianId, clinicId),
        this.guardians.findByIdInClinic(input.guardianId, clinicId),
      ]);
      if (!link || !guardian) {
        throw new NotFoundError('Linked guardian not found', {
          code: ERROR_CODES.GUARDIAN_NOT_LINKED_TO_PATIENT,
        });
      }
      guardianId = guardian._id.toString();
      guardianName = `${guardian.firstName} ${guardian.lastName}`.trim();
      relationship = link.relationship;
    } else if (isMinor(patient.birthDate, signedAt)) {
      throw new BusinessRuleError('A linked guardian must sign for a minor patient', {
        code: ERROR_CODES.CONSENT_GUARDIAN_REQUIRED,
      });
    }

    const treatmentId = input.treatmentId ?? null;
    let treatmentLabel = '';
    if (treatmentId) {
      const treatment = await this.treatments.findByIdInClinic(treatmentId, clinicId);
      if (!treatment || treatment.patientId.toString() !== patientId) {
        throw new NotFoundError('Treatment not found', { code: ERROR_CODES.TREATMENT_NOT_FOUND });
      }
      treatmentLabel = treatment.customTypeLabel ?? formatCodeLabel(treatment.type);
    }
    const retentionPlanId = input.retentionPlanId ?? null;
    if (retentionPlanId) {
      const plan = await this.retention.findPlanById(clinicId, retentionPlanId);
      if (!plan || plan.patientId.toString() !== patientId) {
        throw new NotFoundError('Retention plan not found', { code: ERROR_CODES.NOT_FOUND });
      }
      if (treatmentId && plan.treatmentId.toString() !== treatmentId) {
        throw new BusinessRuleError('Retention plan does not belong to the selected treatment', {
          code: ERROR_CODES.TREATMENT_PATIENT_MISMATCH,
        });
      }
      treatmentLabel ||= 'Retention plan';
    }

    const signerName = input.signerType === CONSENT_SIGNER_TYPES.PATIENT ? patientName : guardianName;
    const presentedByName = `${presenter.firstName} ${presenter.lastName}`.trim() || presenter.email;
    const doctorName = clinic.settings?.general?.doctorDisplayName ?? presentedByName;
    const signedAtLabel = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: clinic.timezone,
    }).format(signedAt);
    const values: ConsentPlaceholderValues = {
      'patient.fullName': patientName,
      'guardian.fullName': guardianName || '—',
      'signer.fullName': signerName,
      'clinic.name': clinic.name,
      'doctor.fullName': doctorName,
      'treatment.label': treatmentLabel || '—',
      date: signedAtLabel,
    };
    return {
      template,
      patientName,
      signerName,
      signerRelationship: relationship,
      guardianId,
      presentedByName,
      clinicName: clinic.name,
      clinicAddress: [clinic.address.line1, clinic.address.city, clinic.address.country]
        .filter(Boolean)
        .join(', ') || null,
      clinicPhone: clinic.phone,
      signedAt,
      signedAtLabel,
      renderedContent: renderConsentTemplate(template.content, values),
      treatmentId,
      retentionPlanId,
    };
  }

  private resolveReplay(record: SignedConsentRecord, payloadDigest: string): SignedConsentDto {
    if (record.payloadDigest !== payloadDigest) {
      throw new ConflictError('This idempotency key was already used for another consent', {
        code: ERROR_CODES.CONSENT_IDEMPOTENCY_CONFLICT,
      });
    }
    return toSignedConsentDto(record);
  }

  private async requirePatient(clinicId: string, patientId: string): Promise<void> {
    if (!(await this.patients.findByIdInClinic(patientId, clinicId))) {
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }
  }

  private async requireConsent(clinicId: string, consentId: string): Promise<SignedConsentRecord> {
    const record = await this.consents.findByIdInClinic(consentId, clinicId);
    if (!record) {
      throw new NotFoundError('Signed consent not found', { code: ERROR_CODES.CONSENT_NOT_FOUND });
    }
    return record;
  }

  private async cleanupArtifacts(
    artifacts: Array<{ publicId: string; resourceType: string }>,
    clinicId: string,
  ): Promise<void> {
    for (const artifact of artifacts) {
      try {
        await this.storage.remove(artifact.publicId, artifact.resourceType);
      } catch (error) {
        logger.error({ err: error, clinicId }, 'Failed to clean up orphaned consent artifact');
      }
    }
  }

  private async recordConsentAudit(
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
    record: SignedConsentRecord,
    context: ConsentMutationContext,
    session: ClientSession | undefined,
  ): Promise<void> {
    await this.audit.record(
      {
        clinicId: record.clinicId.toString(),
        actorUserId: context.actorUserId,
        action,
        resourceType: AUDIT_RESOURCE_TYPES.CONSENT,
        resourceId: record._id.toString(),
        metadata: {
          patientId: record.patientId.toString(),
          consentRef: record.consentRef,
          templateCode: record.templateCode,
          templateVersion: record.templateVersion,
          status: record.status,
        },
        ip: context.ip,
        userAgent: context.userAgent,
      },
      session,
    );
  }
}

function isMinor(birthDate: Date | null, at: Date): boolean {
  if (!birthDate) return false;
  let age = at.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayHasPassed =
    at.getUTCMonth() > birthDate.getUTCMonth() ||
    (at.getUTCMonth() === birthDate.getUTCMonth() && at.getUTCDate() >= birthDate.getUTCDate());
  if (!birthdayHasPassed) age -= 1;
  return age < 18;
}

function formatCodeLabel(value: string): string {
  const label = value.toLowerCase().replaceAll('_', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const consentTemplateService = new ConsentTemplateService();
export const consentService = new ConsentService();

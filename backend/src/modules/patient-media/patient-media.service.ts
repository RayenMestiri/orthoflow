import { ERROR_CODES } from '../../common/constants/error-codes.js';
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
} from '../../common/errors/app-error.js';
import { CLINIC_ROLES } from '../../common/constants/roles.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { logger } from '../../config/logger.js';
import {
  MEDIA_SCOPES,
  mediaService,
  type MediaService,
} from '../../infrastructure/cloudinary/media.service.js';
import { patientRepository, type PatientRepository } from '../patients/patient.repository.js';
import {
  treatmentRepository,
  type TreatmentRepository,
} from '../treatments/treatment.repository.js';
import { patientMediaAudit, type PatientMediaAuditPort } from './patient-media.audit.js';
import { toPatientMediaDto } from './patient-media.mapper.js';
import { patientMediaRepository, type PatientMediaRepository } from './patient-media.repository.js';
import {
  PATIENT_MEDIA_CATEGORIES,
  PATIENT_MEDIA_STATUSES,
  type PatientMediaDto,
  type PatientMediaListFilters,
  type PatientMediaMutationContext,
  type PatientMediaRecord,
  type PatientMediaUploadFile,
  type PatientMediaUploadMetadata,
  type UpdatePatientMediaInput,
} from './patient-media.types.js';

type PatientMediaStorage = Pick<MediaService, 'isEnabled' | 'upload' | 'remove'>;

export class PatientMediaService {
  constructor(
    private readonly media: PatientMediaRepository = patientMediaRepository,
    private readonly patients: PatientRepository = patientRepository,
    private readonly treatments: TreatmentRepository = treatmentRepository,
    private readonly storage: PatientMediaStorage = mediaService,
    private readonly audit: PatientMediaAuditPort = patientMediaAudit,
  ) {}

  async listForPatient(
    clinicId: string,
    patientId: string,
    filters: PatientMediaListFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PatientMediaDto>> {
    await this.requirePatient(clinicId, patientId);
    const result = await this.media.listByPatient(patientId, clinicId, filters, pagination);
    return { items: result.items.map(toPatientMediaDto), total: result.total };
  }

  async getById(clinicId: string, mediaId: string): Promise<PatientMediaDto> {
    return toPatientMediaDto(await this.requireMedia(clinicId, mediaId));
  }

  async upload(
    clinicId: string,
    patientId: string,
    file: PatientMediaUploadFile,
    metadata: PatientMediaUploadMetadata,
    context: PatientMediaMutationContext,
  ): Promise<PatientMediaDto> {
    await this.requirePatient(clinicId, patientId);
    this.assertManageableCategory(metadata.category, context);
    await this.assertTreatment(clinicId, patientId, metadata.treatmentId ?? null);
    if (!this.storage.isEnabled()) {
      throw new ServiceUnavailableError('Patient media storage is not configured', {
        code: ERROR_CODES.MEDIA_STORAGE_UNAVAILABLE,
      });
    }

    const stored = await this.storage.upload({
      clinicId,
      scope:
        metadata.category === PATIENT_MEDIA_CATEGORIES.PROFILE_PHOTO
          ? MEDIA_SCOPES.PROFILE_PHOTOS
          : MEDIA_SCOPES.PATIENT_DOCUMENTS,
      subfolders: [patientId],
      content: file.content,
    });

    let created: PatientMediaRecord;
    try {
      created = await this.media.create({
        clinicId,
        patientId,
        treatmentId: metadata.treatmentId ?? null,
        category: metadata.category,
        mediaType: file.mediaType,
        title: metadata.title,
        description: metadata.description ?? null,
        capturedAt: metadata.capturedAt ?? null,
        uploadedByUserId: context.actorUserId,
        storageProvider: 'CLOUDINARY',
        publicId: stored.publicId,
        resourceType: stored.resourceType,
        secureUrl: stored.secureUrl,
        originalFileName: file.originalFileName,
        mimeType: file.mimeType,
        fileSizeBytes: stored.bytes,
        format: stored.format || null,
        width: stored.width,
        height: stored.height,
        uploadedAt: stored.uploadedAt,
      });
    } catch (error) {
      try {
        await this.storage.remove(stored.publicId, stored.resourceType);
      } catch (cleanupError) {
        logger.error(
          { err: cleanupError, clinicId, patientId },
          'Failed to clean up orphaned patient media',
        );
      }
      throw error;
    }

    await this.audit.record({
      ...context,
      clinicId,
      patientId,
      mediaId: created._id.toString(),
      treatmentId: created.treatmentId?.toString() ?? null,
      event: 'uploaded',
    });
    return toPatientMediaDto(created);
  }

  async update(
    clinicId: string,
    mediaId: string,
    changes: UpdatePatientMediaInput,
    context: PatientMediaMutationContext,
  ): Promise<PatientMediaDto> {
    const existing = await this.requireMedia(clinicId, mediaId);
    this.assertManageableCategory(existing.category, context);
    if (changes.category !== undefined) this.assertManageableCategory(changes.category, context);
    if (changes.treatmentId !== undefined) {
      await this.assertTreatment(clinicId, existing.patientId.toString(), changes.treatmentId);
    }
    const updated = await this.media.update(mediaId, clinicId, changes);
    if (!updated) throw this.notFound();
    await this.audit.record({
      ...context,
      clinicId,
      patientId: updated.patientId.toString(),
      mediaId,
      treatmentId: updated.treatmentId?.toString() ?? null,
      event: 'updated',
      changedFields: Object.keys(changes),
    });
    return toPatientMediaDto(updated);
  }

  async archive(
    clinicId: string,
    mediaId: string,
    reason: string | null,
    context: PatientMediaMutationContext,
  ): Promise<PatientMediaDto> {
    const existing = await this.requireMedia(clinicId, mediaId);
    this.assertManageableCategory(existing.category, context);
    if (existing.status === PATIENT_MEDIA_STATUSES.ARCHIVED) {
      throw new BusinessRuleError('This patient file is already archived', {
        code: ERROR_CODES.MEDIA_ALREADY_ARCHIVED,
      });
    }
    const archived = await this.media.archive(mediaId, clinicId, context.actorUserId, reason);
    if (!archived) throw this.notFound();
    await this.audit.record({
      ...context,
      clinicId,
      patientId: archived.patientId.toString(),
      mediaId,
      treatmentId: archived.treatmentId?.toString() ?? null,
      event: 'archived',
    });
    return toPatientMediaDto(archived);
  }

  private async requirePatient(clinicId: string, patientId: string): Promise<void> {
    const patient = await this.patients.findByIdInClinic(patientId, clinicId);
    if (!patient) {
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }
  }

  private async requireMedia(clinicId: string, mediaId: string): Promise<PatientMediaRecord> {
    const record = await this.media.findByIdInClinic(mediaId, clinicId);
    if (!record) throw this.notFound();
    return record;
  }

  private assertManageableCategory(
    category: PatientMediaRecord['category'],
    context: PatientMediaMutationContext,
  ): void {
    if (
      context.clinicRole === CLINIC_ROLES.SECRETARY &&
      category !== PATIENT_MEDIA_CATEGORIES.ADMINISTRATIVE
    ) {
      throw new ForbiddenError('Front-desk staff may only manage administrative patient files', {
        code: ERROR_CODES.FORBIDDEN_MEDIA_ACCESS,
      });
    }
  }

  private async assertTreatment(
    clinicId: string,
    patientId: string,
    treatmentId: string | null,
  ): Promise<void> {
    if (!treatmentId) return;
    const treatment = await this.treatments.findByIdInClinic(treatmentId, clinicId);
    if (!treatment) {
      throw new NotFoundError('Treatment not found', { code: ERROR_CODES.TREATMENT_NOT_FOUND });
    }
    if (treatment.patientId.toString() !== patientId) {
      throw new BusinessRuleError('Treatment does not belong to this patient', {
        code: ERROR_CODES.TREATMENT_PATIENT_MISMATCH,
      });
    }
  }

  private notFound(): NotFoundError {
    return new NotFoundError('Patient media not found', { code: ERROR_CODES.MEDIA_NOT_FOUND });
  }
}

export const patientMediaService = new PatientMediaService();

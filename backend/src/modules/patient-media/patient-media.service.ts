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

type PatientMediaStorage = Pick<
  MediaService,
  'isEnabled' | 'upload' | 'remove' | 'createPrivateDownloadUrl'
>;

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
    return { items: result.items.map((record) => this.toDto(record)), total: result.total };
  }

  async getById(clinicId: string, mediaId: string): Promise<PatientMediaDto> {
    return this.toDto(await this.requireMedia(clinicId, mediaId));
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
    // Fail before reading the file into a provider call: an unconfigured
    // deployment should say so plainly rather than surface a transport error.
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
      fileName: file.originalFileName,
      mimeType: file.mimeType,
      deliveryType: 'authenticated',
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
        deliveryType: 'authenticated',
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
    return this.toDto(created);
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
    return this.toDto(updated);
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
    return this.toDto(archived);
  }

  async restore(
    clinicId: string,
    mediaId: string,
    context: PatientMediaMutationContext,
  ): Promise<PatientMediaDto> {
    const existing = await this.requireMedia(clinicId, mediaId);
    this.assertManageableCategory(existing.category, context);
    if (existing.status !== PATIENT_MEDIA_STATUSES.ARCHIVED) {
      throw new BusinessRuleError('This patient file is not archived', {
        code: ERROR_CODES.MEDIA_ALREADY_ARCHIVED,
      });
    }
    const restored = await this.media.restore(mediaId, clinicId);
    if (!restored) throw this.notFound();
    await this.audit.record({
      ...context,
      clinicId,
      patientId: restored.patientId.toString(),
      mediaId,
      treatmentId: restored.treatmentId?.toString() ?? null,
      event: 'restored',
    });
    return this.toDto(restored);
  }

  async deletePermanently(
    clinicId: string,
    mediaId: string,
    context: PatientMediaMutationContext,
  ): Promise<void> {
    const existing = await this.requireMedia(clinicId, mediaId);
    this.assertManageableCategory(existing.category, context);

    if (this.storage.isEnabled() && existing.publicId) {
      try {
        await this.storage.remove(existing.publicId, existing.resourceType);
      } catch {
        // Continue DB deletion even if remote binary was already cleaned
      }
    }

    const deleted = await this.media.deleteById(mediaId, clinicId);
    if (!deleted) throw this.notFound();

    await this.audit.record({
      ...context,
      clinicId,
      patientId: existing.patientId.toString(),
      mediaId,
      treatmentId: existing.treatmentId?.toString() ?? null,
      event: 'deleted',
    });
  }

  /**
   * Replaces the binary of an existing media record with a new upload.
   * Metadata (title, category, capturedAt, etc.) is kept as-is.
   * The old Cloudinary asset is deleted after the DB record is updated.
   */
  async replaceFile(
    clinicId: string,
    mediaId: string,
    file: PatientMediaUploadFile,
    context: PatientMediaMutationContext,
  ): Promise<PatientMediaDto> {
    const existing = await this.requireMedia(clinicId, mediaId);
    this.assertManageableCategory(existing.category, context);

    if (!this.storage.isEnabled()) {
      throw new ServiceUnavailableError('Patient media storage is not configured', {
        code: ERROR_CODES.MEDIA_STORAGE_UNAVAILABLE,
      });
    }

    const scope =
      existing.category === PATIENT_MEDIA_CATEGORIES.PROFILE_PHOTO
        ? MEDIA_SCOPES.PROFILE_PHOTOS
        : MEDIA_SCOPES.PATIENT_DOCUMENTS;

    // Upload the new binary first. If this fails the existing record is intact.
    const stored = await this.storage.upload({
      clinicId,
      scope,
      subfolders: [existing.patientId.toString()],
      content: file.content,
      fileName: file.originalFileName,
      mimeType: file.mimeType,
      deliveryType: 'authenticated',
    });

    // Swap the storage fields in MongoDB.
    const updated = await this.media.replaceStorageFields(mediaId, clinicId, {
      publicId: stored.publicId,
      resourceType: stored.resourceType,
      deliveryType: 'authenticated',
      secureUrl: stored.secureUrl,
      mimeType: file.mimeType,
      fileSizeBytes: stored.bytes,
      format: stored.format || null,
      width: stored.width,
      height: stored.height,
      originalFileName: file.originalFileName,
      uploadedAt: stored.uploadedAt,
    });

    if (!updated) {
      // DB write failed — clean up the newly uploaded asset so it doesn't become an orphan.
      try {
        await this.storage.remove(stored.publicId, stored.resourceType);
      } catch (cleanupError) {
        logger.error(
          { err: cleanupError, clinicId, mediaId },
          'Failed to clean up orphaned replacement media',
        );
      }
      throw this.notFound();
    }

    // Now safe to delete the old asset — the new one is already serving.
    if (existing.publicId) {
      try {
        await this.storage.remove(existing.publicId, existing.resourceType);
      } catch (cleanupError) {
        logger.error(
          { err: cleanupError, clinicId, mediaId, publicId: existing.publicId },
          'Failed to remove old Cloudinary asset after replacement — manual cleanup needed',
        );
        // Non-fatal: the clinic can still use the new file.
      }
    }

    await this.audit.record({
      ...context,
      clinicId,
      patientId: existing.patientId.toString(),
      mediaId,
      treatmentId: existing.treatmentId?.toString() ?? null,
      event: 'replaced',
    });

    return this.toDto(updated);
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

  private toDto(record: PatientMediaRecord): PatientMediaDto {
    let contentUrl = record.secureUrl ?? '';
    if (!contentUrl && record.publicId) {
      try {
        contentUrl = this.storage.createPrivateDownloadUrl(
          record.publicId,
          record.resourceType,
          record.deliveryType ?? 'upload',
          record.format ?? '',
        );
      } catch {
        contentUrl = '';
      }
    }
    return toPatientMediaDto(record, contentUrl);
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

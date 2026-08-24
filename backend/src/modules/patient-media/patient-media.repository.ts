import type { QueryFilter } from 'mongoose';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { containsInsensitive } from '../../infrastructure/database/query.helpers.js';
import { PatientMediaModel } from './patient-media.model.js';
import {
  PATIENT_MEDIA_STATUSES,
  type CreatePatientMediaInput,
  type PatientMediaAttributes,
  type PatientMediaListFilters,
  type PatientMediaRecord,
  type UpdatePatientMediaInput,
} from './patient-media.types.js';

export class PatientMediaRepository {
  private baseFilter(clinicId: string): QueryFilter<PatientMediaAttributes> {
    return { clinicId: toObjectId(clinicId, 'clinicId') };
  }

  async findByIdInClinic(mediaId: string, clinicId: string): Promise<PatientMediaRecord | null> {
    return PatientMediaModel.findOne({
      ...this.baseFilter(clinicId),
      _id: toObjectId(mediaId, 'mediaId'),
    })
      .lean<PatientMediaRecord | null>()
      .exec();
  }

  async findManyByIdsForPatient(
    mediaIds: string[],
    patientId: string,
    clinicId: string,
  ): Promise<PatientMediaRecord[]> {
    if (mediaIds.length === 0) return [];
    return PatientMediaModel.find({
      ...this.baseFilter(clinicId),
      _id: { $in: mediaIds.map((id) => toObjectId(id, 'mediaId')) },
      patientId: toObjectId(patientId, 'patientId'),
      status: PATIENT_MEDIA_STATUSES.ACTIVE,
    })
      .limit(mediaIds.length)
      .lean<PatientMediaRecord[]>()
      .exec();
  }

  async listByPatient(
    patientId: string,
    clinicId: string,
    filters: PatientMediaListFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PatientMediaRecord>> {
    const filter: QueryFilter<PatientMediaAttributes> = {
      ...this.baseFilter(clinicId),
      patientId: toObjectId(patientId, 'patientId'),
      status: filters.status ?? PATIENT_MEDIA_STATUSES.ACTIVE,
    };
    if (filters.category) filter.category = filters.category;
    if (filters.mediaType) filter.mediaType = filters.mediaType;
    if (filters.treatmentId) filter.treatmentId = toObjectId(filters.treatmentId, 'treatmentId');
    if (filters.search) filter.title = containsInsensitive(filters.search);
    if (filters.from || filters.to) {
      filter.uploadedAt = {
        ...(filters.from ? { $gte: filters.from } : {}),
        ...(filters.to ? { $lte: filters.to } : {}),
      };
    }

    const [items, total] = await Promise.all([
      PatientMediaModel.find(filter)
        .sort({ uploadedAt: -1, createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<PatientMediaRecord[]>()
        .exec(),
      PatientMediaModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async create(input: CreatePatientMediaInput): Promise<PatientMediaRecord> {
    const [created] = await PatientMediaModel.create([
      {
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        patientId: toObjectId(input.patientId, 'patientId'),
        treatmentId: input.treatmentId ? toObjectId(input.treatmentId, 'treatmentId') : null,
        category: input.category,
        mediaType: input.mediaType,
        title: input.title,
        description: input.description ?? null,
        storageProvider: input.storageProvider,
        publicId: input.publicId,
        resourceType: input.resourceType,
        deliveryType: input.deliveryType,
        secureUrl: input.secureUrl,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        format: input.format,
        width: input.width,
        height: input.height,
        capturedAt: input.capturedAt ?? null,
        uploadedAt: input.uploadedAt,
        uploadedByUserId: toObjectId(input.uploadedByUserId, 'uploadedByUserId'),
      },
    ]);
    if (!created) throw new Error('Patient media creation returned no document');
    return created.toObject<PatientMediaRecord>();
  }

  async update(
    mediaId: string,
    clinicId: string,
    changes: UpdatePatientMediaInput,
  ): Promise<PatientMediaRecord | null> {
    const set: Record<string, unknown> = {};
    if (changes.category !== undefined) set.category = changes.category;
    if (changes.title !== undefined) set.title = changes.title;
    if (changes.description !== undefined) set.description = changes.description;
    if (changes.treatmentId !== undefined) {
      set.treatmentId = changes.treatmentId ? toObjectId(changes.treatmentId, 'treatmentId') : null;
    }
    if (changes.capturedAt !== undefined) set.capturedAt = changes.capturedAt;
    if (Object.keys(set).length === 0) return this.findByIdInClinic(mediaId, clinicId);
    return PatientMediaModel.findOneAndUpdate(
      { ...this.baseFilter(clinicId), _id: toObjectId(mediaId, 'mediaId') },
      { $set: set },
      { new: true, runValidators: true },
    )
      .lean<PatientMediaRecord | null>()
      .exec();
  }

  async archive(
    mediaId: string,
    clinicId: string,
    archivedByUserId: string,
    archiveReason: string | null,
  ): Promise<PatientMediaRecord | null> {
    return PatientMediaModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(mediaId, 'mediaId'),
        status: PATIENT_MEDIA_STATUSES.ACTIVE,
      },
      {
        $set: {
          status: PATIENT_MEDIA_STATUSES.ARCHIVED,
          archivedAt: new Date(),
          archivedByUserId: toObjectId(archivedByUserId, 'archivedByUserId'),
          archiveReason,
        },
      },
      { new: true, runValidators: true },
    )
      .lean<PatientMediaRecord | null>()
      .exec();
  }
  async restore(mediaId: string, clinicId: string): Promise<PatientMediaRecord | null> {
    return PatientMediaModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(mediaId, 'mediaId'),
        status: PATIENT_MEDIA_STATUSES.ARCHIVED,
      },
      {
        $set: { status: PATIENT_MEDIA_STATUSES.ACTIVE },
        $unset: { archivedAt: '', archivedByUserId: '', archiveReason: '' },
      },
      { new: true, runValidators: true },
    )
      .lean<PatientMediaRecord | null>()
      .exec();
  }

  /**
   * Atomically replaces the storage-level fields after a Cloudinary upload.
   * Metadata (title, category, etc.) is left untouched.
   */
  async replaceStorageFields(
    mediaId: string,
    clinicId: string,
    fields: {
      publicId: string;
      resourceType: string;
      deliveryType: 'authenticated';
      secureUrl: string;
      mimeType: string;
      fileSizeBytes: number;
      format: string | null;
      width: number | null;
      height: number | null;
      originalFileName: string;
      uploadedAt: Date;
    },
  ): Promise<PatientMediaRecord | null> {
    return PatientMediaModel.findOneAndUpdate(
      { ...this.baseFilter(clinicId), _id: toObjectId(mediaId, 'mediaId') },
      { $set: fields },
      { new: true, runValidators: true },
    )
      .lean<PatientMediaRecord | null>()
      .exec();
  }
}

export const patientMediaRepository = new PatientMediaRepository();

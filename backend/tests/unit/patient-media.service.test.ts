import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/common/errors/app-error.js';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import type { PatientMediaMutationContext } from '../../src/modules/patient-media/patient-media.types.js';
import type { MediaService } from '../../src/infrastructure/cloudinary/media.service.js';
import type { PatientRepository } from '../../src/modules/patients/patient.repository.js';
import type { TreatmentRepository } from '../../src/modules/treatments/treatment.repository.js';
import type { PatientMediaAuditPort } from '../../src/modules/patient-media/patient-media.audit.js';
import type { PatientMediaRepository } from '../../src/modules/patient-media/patient-media.repository.js';
import { PatientMediaService } from '../../src/modules/patient-media/patient-media.service.js';
import {
  PATIENT_MEDIA_CATEGORIES,
  PATIENT_MEDIA_STATUSES,
  PATIENT_MEDIA_TYPES,
  type PatientMediaRecord,
} from '../../src/modules/patient-media/patient-media.types.js';

const CLINIC_ID = new Types.ObjectId().toString();
const OTHER_CLINIC_ID = new Types.ObjectId().toString();
const PATIENT_ID = new Types.ObjectId().toString();
const TREATMENT_ID = new Types.ObjectId().toString();
const MEDIA_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();
const CONTEXT: PatientMediaMutationContext = {
  actorUserId: USER_ID,
  clinicRole: CLINIC_ROLES.ORTHODONTIST,
  ip: null,
  userAgent: null,
};

function record(overrides: Partial<PatientMediaRecord> = {}): PatientMediaRecord {
  const now = new Date('2026-08-09T09:00:00.000Z');
  return {
    _id: new Types.ObjectId(MEDIA_ID),
    clinicId: new Types.ObjectId(CLINIC_ID),
    patientId: new Types.ObjectId(PATIENT_ID),
    treatmentId: null,
    category: PATIENT_MEDIA_CATEGORIES.EXTRAORAL_PHOTO,
    mediaType: PATIENT_MEDIA_TYPES.IMAGE,
    title: 'Front view',
    description: null,
    storageProvider: 'CLOUDINARY',
    publicId: 'orthoflow/opaque-media-id',
    resourceType: 'image',
    secureUrl: 'https://res.cloudinary.com/demo/image/upload/opaque-media-id.jpg',
    originalFileName: 'front-view.jpg',
    mimeType: 'image/jpeg',
    fileSizeBytes: 3,
    format: 'jpg',
    width: 1200,
    height: 900,
    capturedAt: null,
    uploadedAt: now,
    uploadedByUserId: new Types.ObjectId(USER_ID),
    status: PATIENT_MEDIA_STATUSES.ACTIVE,
    archivedAt: null,
    archivedByUserId: null,
    archiveReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('PatientMediaService', () => {
  let mediaRepository: {
    findByIdInClinic: ReturnType<typeof vi.fn>;
    listByPatient: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    archive: ReturnType<typeof vi.fn>;
  };
  let patientRepository: { findByIdInClinic: ReturnType<typeof vi.fn> };
  let treatmentRepository: { findByIdInClinic: ReturnType<typeof vi.fn> };
  let storage: {
    isEnabled: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    createPrivateDownloadUrl: ReturnType<typeof vi.fn>;
  };
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: PatientMediaService;

  beforeEach(() => {
    mediaRepository = {
      findByIdInClinic: vi.fn(async () => record()),
      listByPatient: vi.fn(async () => ({ items: [record()], total: 1 })),
      create: vi.fn(async (input: { treatmentId?: string | null }) =>
        record({
          treatmentId: input.treatmentId ? new Types.ObjectId(input.treatmentId) : null,
        }),
      ),
      update: vi.fn(async () => record({ title: 'Updated title' })),
      archive: vi.fn(async () =>
        record({
          status: PATIENT_MEDIA_STATUSES.ARCHIVED,
          archivedAt: new Date('2026-08-09T10:00:00.000Z'),
          archivedByUserId: new Types.ObjectId(USER_ID),
        }),
      ),
    };
    patientRepository = {
      findByIdInClinic: vi.fn(async (patientId: string, clinicId: string) =>
        patientId === PATIENT_ID && clinicId === CLINIC_ID ? { _id: patientId } : null,
      ),
    };
    treatmentRepository = {
      findByIdInClinic: vi.fn(async (treatmentId: string, clinicId: string) =>
        treatmentId === TREATMENT_ID && clinicId === CLINIC_ID
          ? { patientId: new Types.ObjectId(PATIENT_ID) }
          : null,
      ),
    };
    storage = {
      isEnabled: vi.fn(() => true),
      upload: vi.fn(async () => ({
        provider: 'cloudinary' as const,
        publicId: 'orthoflow/opaque-media-id',
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/opaque-media-id.jpg',
        format: 'jpg',
        bytes: 3,
        width: 1200,
        height: 900,
        resourceType: 'image',
        uploadedAt: new Date('2026-08-09T09:00:00.000Z'),
      })),
      remove: vi.fn(async () => undefined),
      createPrivateDownloadUrl: vi.fn(
        () => 'https://res.cloudinary.com/demo/private/short-lived.jpg',
      ),
    };
    audit = { record: vi.fn(async () => undefined) };
    service = new PatientMediaService(
      mediaRepository as unknown as PatientMediaRepository,
      patientRepository as unknown as PatientRepository,
      treatmentRepository as unknown as TreatmentRepository,
      storage as unknown as Pick<
        MediaService,
        'isEnabled' | 'upload' | 'remove' | 'createPrivateDownloadUrl'
      >,
      audit as unknown as PatientMediaAuditPort,
    );
  });

  it('uploads through the tenant-scoped patient folder and persists trusted ownership', async () => {
    const result = await service.upload(
      CLINIC_ID,
      PATIENT_ID,
      {
        content: Buffer.from([0xff, 0xd8, 0xff]),
        originalFileName: 'front-view.jpg',
        mimeType: 'image/jpeg',
        mediaType: PATIENT_MEDIA_TYPES.IMAGE,
      },
      { category: PATIENT_MEDIA_CATEGORIES.EXTRAORAL_PHOTO, title: 'Front view' },
      CONTEXT,
    );

    expect(result.patientId).toBe(PATIENT_ID);
    expect(result.contentUrl).toBe('https://res.cloudinary.com/demo/image/upload/opaque-media-id.jpg');
    expect(result).not.toHaveProperty('secureUrl');
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC_ID, subfolders: [PATIENT_ID] }),
    );
    expect(mediaRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC_ID,
        patientId: PATIENT_ID,
        uploadedByUserId: USER_ID,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'uploaded' }));
  });

  it('accepts a treatment only when it belongs to the same patient and clinic', async () => {
    await service.upload(
      CLINIC_ID,
      PATIENT_ID,
      {
        content: Buffer.from([0xff, 0xd8, 0xff]),
        originalFileName: 'progress.jpg',
        mimeType: 'image/jpeg',
        mediaType: PATIENT_MEDIA_TYPES.IMAGE,
      },
      {
        category: PATIENT_MEDIA_CATEGORIES.PROGRESS_PHOTO,
        title: 'Month six',
        treatmentId: TREATMENT_ID,
      },
      CONTEXT,
    );
    expect(treatmentRepository.findByIdInClinic).toHaveBeenCalledWith(TREATMENT_ID, CLINIC_ID);
    expect(mediaRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ treatmentId: TREATMENT_ID }),
    );
  });

  it('rejects a treatment belonging to another patient', async () => {
    treatmentRepository.findByIdInClinic.mockResolvedValue({
      patientId: new Types.ObjectId(),
    });
    await expect(
      service.upload(
        CLINIC_ID,
        PATIENT_ID,
        {
          content: Buffer.from([0xff, 0xd8, 0xff]),
          originalFileName: 'progress.jpg',
          mimeType: 'image/jpeg',
          mediaType: PATIENT_MEDIA_TYPES.IMAGE,
        },
        {
          category: PATIENT_MEDIA_CATEGORIES.PROGRESS_PHOTO,
          title: 'Month six',
          treatmentId: TREATMENT_ID,
        },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ code: 'TREATMENT_PATIENT_MISMATCH' });
  });

  it('does not reveal or upload against a patient from another clinic', async () => {
    await expect(
      service.upload(
        OTHER_CLINIC_ID,
        PATIENT_ID,
        {
          content: Buffer.from([0xff, 0xd8, 0xff]),
          originalFileName: 'front.jpg',
          mimeType: 'image/jpeg',
          mediaType: PATIENT_MEDIA_TYPES.IMAGE,
        },
        { category: PATIENT_MEDIA_CATEGORIES.EXTRAORAL_PHOTO, title: 'Front' },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ code: 'PATIENT_NOT_FOUND' });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('fails safely when Cloudinary is not configured', async () => {
    storage.isEnabled.mockReturnValue(false);
    await expect(
      service.upload(
        CLINIC_ID,
        PATIENT_ID,
        {
          content: Buffer.from([0xff, 0xd8, 0xff]),
          originalFileName: 'front.jpg',
          mimeType: 'image/jpeg',
          mediaType: PATIENT_MEDIA_TYPES.IMAGE,
        },
        { category: PATIENT_MEDIA_CATEGORIES.EXTRAORAL_PHOTO, title: 'Front' },
        CONTEXT,
      ),
    ).rejects.toMatchObject({ code: 'MEDIA_STORAGE_UNAVAILABLE' });
  });

  it('limits secretary mutations to administrative files', async () => {
    const secretaryContext: PatientMediaMutationContext = {
      ...CONTEXT,
      clinicRole: CLINIC_ROLES.SECRETARY,
    };
    await expect(
      service.upload(
        CLINIC_ID,
        PATIENT_ID,
        {
          content: Buffer.from('%PDF-1.7'),
          originalFileName: 'xray.pdf',
          mimeType: 'application/pdf',
          mediaType: PATIENT_MEDIA_TYPES.PDF,
        },
        { category: PATIENT_MEDIA_CATEGORIES.XRAY, title: 'Panoramic X-ray' },
        secretaryContext,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_MEDIA_ACCESS' });

    await service.upload(
      CLINIC_ID,
      PATIENT_ID,
      {
        content: Buffer.from('%PDF-1.7'),
        originalFileName: 'insurance.pdf',
        mimeType: 'application/pdf',
        mediaType: PATIENT_MEDIA_TYPES.PDF,
      },
      { category: PATIENT_MEDIA_CATEGORIES.ADMINISTRATIVE, title: 'Insurance form' },
      secretaryContext,
    );
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it('does not reveal a media id from another clinic', async () => {
    mediaRepository.findByIdInClinic.mockResolvedValue(null);
    await expect(service.getById(OTHER_CLINIC_ID, MEDIA_ID)).rejects.toMatchObject({
      code: 'MEDIA_NOT_FOUND',
    });
    expect(mediaRepository.findByIdInClinic).toHaveBeenCalledWith(MEDIA_ID, OTHER_CLINIC_ID);
  });

  it('removes the provider asset if metadata persistence fails', async () => {
    mediaRepository.create.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.upload(
        CLINIC_ID,
        PATIENT_ID,
        {
          content: Buffer.from([0xff, 0xd8, 0xff]),
          originalFileName: 'front.jpg',
          mimeType: 'image/jpeg',
          mediaType: PATIENT_MEDIA_TYPES.IMAGE,
        },
        { category: PATIENT_MEDIA_CATEGORIES.EXTRAORAL_PHOTO, title: 'Front' },
        CONTEXT,
      ),
    ).rejects.toThrow('database unavailable');
    expect(storage.remove).toHaveBeenCalledWith('orthoflow/opaque-media-id', 'image');
  });

  it('lists active media by default through a bounded repository query', async () => {
    const result = await service.listForPatient(
      CLINIC_ID,
      PATIENT_ID,
      {},
      { page: 1, limit: 20, skip: 0 },
    );
    expect(result.total).toBe(1);
    expect(mediaRepository.listByPatient).toHaveBeenCalledWith(
      PATIENT_ID,
      CLINIC_ID,
      {},
      { page: 1, limit: 20, skip: 0 },
    );
  });

  it('updates metadata and audits only changed field names', async () => {
    const result = await service.update(CLINIC_ID, MEDIA_ID, { title: 'Updated title' }, CONTEXT);
    expect(result.title).toBe('Updated title');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'updated', changedFields: ['title'] }),
    );
  });

  it('archives metadata without deleting the Cloudinary asset', async () => {
    const result = await service.archive(CLINIC_ID, MEDIA_ID, 'Duplicate upload', CONTEXT);
    expect(result.status).toBe(PATIENT_MEDIA_STATUSES.ARCHIVED);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'archived' }));
  });

  it('rejects repeated archive attempts', async () => {
    mediaRepository.findByIdInClinic.mockResolvedValue(
      record({ status: PATIENT_MEDIA_STATUSES.ARCHIVED }),
    );
    const error = await service.archive(CLINIC_ID, MEDIA_ID, null, CONTEXT).catch((value) => value);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(422);
    expect(mediaRepository.archive).not.toHaveBeenCalled();
  });
});

import type { PatientMediaDto, PatientMediaRecord } from './patient-media.types.js';

export function toPatientMediaDto(record: PatientMediaRecord, contentUrl: string): PatientMediaDto {
  return {
    id: record._id.toString(),
    clinicId: record.clinicId.toString(),
    patientId: record.patientId.toString(),
    treatmentId: record.treatmentId?.toString() ?? null,
    category: record.category,
    mediaType: record.mediaType,
    title: record.title,
    description: record.description,
    storageProvider: record.storageProvider,
    contentUrl,
    originalFileName: record.originalFileName,
    mimeType: record.mimeType,
    fileSizeBytes: record.fileSizeBytes,
    format: record.format,
    width: record.width,
    height: record.height,
    capturedAt: record.capturedAt?.toISOString() ?? null,
    uploadedAt: record.uploadedAt.toISOString(),
    uploadedByUserId: record.uploadedByUserId.toString(),
    status: record.status,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    archivedByUserId: record.archivedByUserId?.toString() ?? null,
    archiveReason: record.archiveReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

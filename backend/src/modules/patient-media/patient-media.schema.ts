import { z } from 'zod';
import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQuerySchema,
  searchQuerySchema,
} from '../../common/validation/common.schemas.js';
import {
  PATIENT_MEDIA_CATEGORY_VALUES,
  PATIENT_MEDIA_STATUS_VALUES,
  PATIENT_MEDIA_TYPE_VALUES,
} from './patient-media.types.js';

export const patientMediaDtoSchema = z.object({
  id: objectIdSchema,
  clinicId: objectIdSchema,
  patientId: objectIdSchema,
  treatmentId: objectIdSchema.nullable(),
  category: z.enum(PATIENT_MEDIA_CATEGORY_VALUES),
  mediaType: z.enum(PATIENT_MEDIA_TYPE_VALUES),
  title: z.string(),
  description: z.string().nullable(),
  storageProvider: z.string(),
  /** Short-lived or direct media URL; accepts any valid string or empty fallback. */
  contentUrl: z.string(),
  originalFileName: z.string(),
  mimeType: z.string(),
  fileSizeBytes: z.number().int().positive(),
  format: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  capturedAt: isoDateTimeSchema.nullable(),
  uploadedAt: isoDateTimeSchema,
  uploadedByUserId: objectIdSchema,
  status: z.enum(PATIENT_MEDIA_STATUS_VALUES),
  archivedAt: isoDateTimeSchema.nullable(),
  archivedByUserId: objectIdSchema.nullable(),
  archiveReason: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const patientMediaDeleteResponseSchema = z.object({
  deleted: z.boolean(),
  id: objectIdSchema.optional(),
});

export const patientMediaIdParamSchema = z.object({ mediaId: objectIdSchema });
export const patientMediaPatientIdParamSchema = z.object({ patientId: objectIdSchema });

export const patientMediaListQuerySchema = paginationQuerySchema.extend({
  category: z.enum(PATIENT_MEDIA_CATEGORY_VALUES).optional(),
  mediaType: z.enum(PATIENT_MEDIA_TYPE_VALUES).optional(),
  status: z.enum(PATIENT_MEDIA_STATUS_VALUES).optional(),
  treatmentId: objectIdSchema.optional(),
  search: searchQuerySchema,
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});

export const patientMediaUploadMetadataSchema = z.object({
  category: z.enum(PATIENT_MEDIA_CATEGORY_VALUES),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  treatmentId: objectIdSchema.nullable().optional(),
  capturedAt: isoDateTimeSchema.nullable().optional(),
});

export const updatePatientMediaBodySchema = patientMediaUploadMetadataSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable field must be provided',
  });

export const archivePatientMediaBodySchema = z.object({
  reason: z.string().trim().min(1).max(500).nullable().optional(),
});

export type PatientMediaIdParam = z.infer<typeof patientMediaIdParamSchema>;
export type PatientMediaPatientIdParam = z.infer<typeof patientMediaPatientIdParamSchema>;
export type PatientMediaListQuery = z.infer<typeof patientMediaListQuerySchema>;
export type PatientMediaUploadMetadataBody = z.infer<typeof patientMediaUploadMetadataSchema>;
export type UpdatePatientMediaBody = z.infer<typeof updatePatientMediaBodySchema>;
export type ArchivePatientMediaBody = z.infer<typeof archivePatientMediaBodySchema>;

import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from '../../common/validation/common.schemas.js';
import {
  CONSENT_CATEGORY_VALUES,
  CONSENT_SIGNER_TYPE_VALUES,
  CONSENT_TEMPLATE_STATUS_VALUES,
  SIGNED_CONSENT_STATUS_VALUES,
} from './consent.types.js';

const templateCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(48)
  .regex(/^[A-Z][A-Z0-9_-]*$/, 'must contain only uppercase letters, numbers, _ or -');
const titleSchema = z.string().trim().min(2).max(160);
const contentSchema = z.string().trim().min(20).max(20_000);
const optionalObjectId = objectIdSchema.nullable().optional();

export const consentTemplateIdParamSchema = z.object({ templateId: objectIdSchema });
export type ConsentTemplateIdParam = z.infer<typeof consentTemplateIdParamSchema>;
export const consentIdParamSchema = z.object({ consentId: objectIdSchema });
export type ConsentIdParam = z.infer<typeof consentIdParamSchema>;
export const consentPatientIdParamSchema = z.object({ patientId: objectIdSchema });
export type ConsentPatientIdParam = z.infer<typeof consentPatientIdParamSchema>;

export const consentTemplateListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CONSENT_TEMPLATE_STATUS_VALUES).optional(),
  category: z.enum(CONSENT_CATEGORY_VALUES).optional(),
  code: templateCodeSchema.optional(),
});
export type ConsentTemplateListQuery = z.infer<typeof consentTemplateListQuerySchema>;

export const createConsentTemplateBodySchema = z.object({
  code: templateCodeSchema,
  title: titleSchema,
  category: z.enum(CONSENT_CATEGORY_VALUES),
  content: contentSchema,
});
export type CreateConsentTemplateBody = z.infer<typeof createConsentTemplateBodySchema>;

export const updateConsentTemplateBodySchema = z
  .object({
    title: titleSchema.optional(),
    category: z.enum(CONSENT_CATEGORY_VALUES).optional(),
    content: contentSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one change' });
export type UpdateConsentTemplateBody = z.infer<typeof updateConsentTemplateBodySchema>;

export const createConsentTemplateVersionBodySchema = z.object({
  title: titleSchema.optional(),
  category: z.enum(CONSENT_CATEGORY_VALUES).optional(),
  content: contentSchema.optional(),
});
export type CreateConsentTemplateVersionBody = z.infer<
  typeof createConsentTemplateVersionBodySchema
>;

export const consentSigningMetadataSchema = z.object({
  templateId: objectIdSchema,
  signerType: z.enum(CONSENT_SIGNER_TYPE_VALUES),
  guardianId: optionalObjectId,
  treatmentId: optionalObjectId,
  retentionPlanId: optionalObjectId,
  idempotencyKey: z.string().trim().min(16).max(64),
  acknowledgement: z.literal(true),
});

export const consentPreviewBodySchema = consentSigningMetadataSchema.omit({
  idempotencyKey: true,
  acknowledgement: true,
});
export type ConsentPreviewBody = z.infer<typeof consentPreviewBodySchema>;

export const consentListQuerySchema = paginationQuerySchema;
export type ConsentListQuery = z.infer<typeof consentListQuerySchema>;

export const consentReasonBodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type ConsentReasonBody = z.infer<typeof consentReasonBodySchema>;

export const consentTemplateDtoSchema = z.object({
  id: objectIdSchema,
  code: z.string(),
  version: z.number().int().positive(),
  versionLabel: z.string(),
  title: z.string(),
  category: z.enum(CONSENT_CATEGORY_VALUES),
  content: z.string(),
  status: z.enum(CONSENT_TEMPLATE_STATUS_VALUES),
  activatedAt: z.iso.datetime().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const signedConsentDtoSchema = z.object({
  id: objectIdSchema,
  patientId: objectIdSchema,
  treatmentId: objectIdSchema.nullable(),
  retentionPlanId: objectIdSchema.nullable(),
  consentRef: z.string(),
  templateId: objectIdSchema,
  templateCode: z.string(),
  templateVersion: z.number().int().positive(),
  versionLabel: z.string(),
  category: z.enum(CONSENT_CATEGORY_VALUES),
  title: z.string(),
  contentSnapshot: z.string(),
  patientName: z.string(),
  signerType: z.enum(CONSENT_SIGNER_TYPE_VALUES),
  guardianId: objectIdSchema.nullable(),
  signerName: z.string(),
  signerRelationship: z.string().nullable(),
  status: z.enum(SIGNED_CONSENT_STATUS_VALUES),
  signedAt: z.iso.datetime(),
  presentedByName: z.string(),
  pdfSha256: z.string().length(64),
  pdfByteSize: z.number().int().positive(),
  pdfDownloadPath: z.string(),
  revokedAt: z.iso.datetime().nullable(),
  revocationReason: z.string().nullable(),
  voidedAt: z.iso.datetime().nullable(),
  voidReason: z.string().nullable(),
});

export const consentPreviewDtoSchema = z.object({
  templateId: objectIdSchema,
  templateCode: z.string(),
  templateVersion: z.number().int().positive(),
  versionLabel: z.string(),
  category: z.enum(CONSENT_CATEGORY_VALUES),
  title: z.string(),
  renderedContent: z.string(),
  patientName: z.string(),
  signerType: z.enum(CONSENT_SIGNER_TYPE_VALUES),
  guardianId: objectIdSchema.nullable(),
  signerName: z.string(),
  signerRelationship: z.string().nullable(),
  presentedByName: z.string(),
  signingDate: z.string(),
});

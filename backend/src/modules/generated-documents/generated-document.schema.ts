import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from '../../common/validation/common.schemas.js';
import { DOCUMENT_BLOCK_KIND_VALUES, DOCUMENT_CATEGORY_VALUES, DOCUMENT_TABLE_SOURCE_VALUES, DOCUMENT_TEMPLATE_STATUS_VALUES, GENERATED_DOCUMENT_STATUS_VALUES } from './generated-document.types.js';

const codeSchema = z.string().trim().toUpperCase().min(2).max(48).regex(/^[A-Z][A-Z0-9_-]*$/);
const titleSchema = z.string().trim().min(2).max(160);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalObjectId = objectIdSchema.nullable().optional();
const columnSchema = z.object({ key: z.string().trim().min(1).max(48).regex(/^[a-z][a-zA-Z0-9]*$/), label: z.string().trim().min(1).max(80) });
export const documentBlockSchema = z.object({ kind: z.enum(DOCUMENT_BLOCK_KIND_VALUES), text: z.string().trim().min(1).max(4000).optional(), level: z.union([z.literal(1), z.literal(2)]).optional(), label: z.string().trim().min(1).max(160).optional(), value: z.string().trim().min(1).max(4000).optional(), omitWhenEmpty: z.boolean().optional(), source: z.enum(DOCUMENT_TABLE_SOURCE_VALUES).optional(), columns: z.array(columnSchema).max(8).optional() });
const definitionSchema = z.array(documentBlockSchema).min(1).max(40);

export const documentTemplateIdParamSchema = z.object({ templateId: objectIdSchema });
export const generatedDocumentIdParamSchema = z.object({ documentId: objectIdSchema });
export const generatedDocumentPatientIdParamSchema = z.object({ patientId: objectIdSchema });
export type DocumentTemplateIdParam = z.infer<typeof documentTemplateIdParamSchema>;
export type GeneratedDocumentIdParam = z.infer<typeof generatedDocumentIdParamSchema>;
export type GeneratedDocumentPatientIdParam = z.infer<typeof generatedDocumentPatientIdParamSchema>;

export const documentTemplateListQuerySchema = paginationQuerySchema.extend({ status: z.enum(DOCUMENT_TEMPLATE_STATUS_VALUES).optional(), category: z.enum(DOCUMENT_CATEGORY_VALUES).optional(), code: codeSchema.optional() });
export type DocumentTemplateListQuery = z.infer<typeof documentTemplateListQuerySchema>;
export const generatedDocumentListQuerySchema = paginationQuerySchema;
export type GeneratedDocumentListQuery = z.infer<typeof generatedDocumentListQuerySchema>;

export const createDocumentTemplateBodySchema = z.object({ code: codeSchema, title: titleSchema, category: z.enum(DOCUMENT_CATEGORY_VALUES), definition: definitionSchema });
export type CreateDocumentTemplateBody = z.infer<typeof createDocumentTemplateBodySchema>;
export const updateDocumentTemplateBodySchema = z.object({ title: titleSchema.optional(), category: z.enum(DOCUMENT_CATEGORY_VALUES).optional(), definition: definitionSchema.optional() }).refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one change' });
export type UpdateDocumentTemplateBody = z.infer<typeof updateDocumentTemplateBodySchema>;
export const createDocumentTemplateVersionBodySchema = z.object({ title: titleSchema.optional(), category: z.enum(DOCUMENT_CATEGORY_VALUES).optional(), definition: definitionSchema.optional() });
export type CreateDocumentTemplateVersionBody = z.infer<typeof createDocumentTemplateVersionBodySchema>;

const contextSelectionSchema = z.object({ guardianId: optionalObjectId, treatmentId: optionalObjectId, retentionPlanId: optionalObjectId, appointmentId: optionalObjectId, from: dateSchema.nullable().optional(), to: dateSchema.nullable().optional(), referralRecipient: z.string().trim().min(2).max(160).nullable().optional(), referralReason: z.string().trim().min(2).max(500).nullable().optional(), referralMessage: z.string().trim().min(2).max(3000).nullable().optional(), selectedMilestoneIds: z.array(objectIdSchema).max(100).optional() });
export const previewGeneratedDocumentBodySchema = contextSelectionSchema.extend({ templateId: objectIdSchema });
export type PreviewGeneratedDocumentBody = z.infer<typeof previewGeneratedDocumentBodySchema>;
export const finalizeGeneratedDocumentBodySchema = contextSelectionSchema.extend({ templateId: objectIdSchema, previewDigest: z.string().length(64).regex(/^[a-f0-9]+$/), idempotencyKey: z.string().trim().min(16).max(64) });
export type FinalizeGeneratedDocumentBody = z.infer<typeof finalizeGeneratedDocumentBodySchema>;
export const generatedDocumentReasonBodySchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type GeneratedDocumentReasonBody = z.infer<typeof generatedDocumentReasonBodySchema>;

const resolvedCellSchema = z.object({ key: z.string(), value: z.string() });
const resolvedRowSchema = z.object({ cells: z.array(resolvedCellSchema) });
const resolvedBlockSchema = documentBlockSchema.extend({ rows: z.array(resolvedRowSchema).optional() });
const contextSnapshotSchema = z.object({ patient: z.object({ id: objectIdSchema, fullName: z.string(), birthDate: z.string().nullable(), referenceNumber: z.string().nullable() }), guardian: z.object({ id: objectIdSchema, fullName: z.string(), relationship: z.string() }).nullable(), treatment: z.object({ id: objectIdSchema, label: z.string(), status: z.string(), startDate: z.string().nullable(), completedAt: z.string().nullable() }).nullable(), retention: z.object({ id: objectIdSchema, status: z.string(), startedAt: z.string().nullable(), nextControlAt: z.string().nullable() }).nullable(), appointment: z.object({ id: objectIdSchema, scheduledAt: z.iso.datetime(), status: z.string(), typeLabel: z.string() }).nullable(), finance: z.object({ from: dateSchema, to: dateSchema, totalRecordedMinor: z.number().int(), currency: z.string(), recordCount: z.number().int() }).nullable() });
export const documentTemplateDtoSchema = z.object({ id: objectIdSchema, code: z.string(), version: z.number().int().positive(), versionLabel: z.string(), title: z.string(), category: z.enum(DOCUMENT_CATEGORY_VALUES), definition: z.array(documentBlockSchema), variablesUsed: z.array(z.string()), status: z.enum(DOCUMENT_TEMPLATE_STATUS_VALUES), activatedAt: z.iso.datetime().nullable(), archivedAt: z.iso.datetime().nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
export const generatedDocumentDtoSchema = z.object({ id: objectIdSchema, patientId: objectIdSchema, documentRef: z.string(), templateId: objectIdSchema, templateCode: z.string(), templateVersion: z.number().int(), versionLabel: z.string(), category: z.enum(DOCUMENT_CATEGORY_VALUES), title: z.string(), contentSnapshot: z.array(resolvedBlockSchema), contextSnapshot: contextSnapshotSchema, generatedByName: z.string(), generatedAt: z.iso.datetime(), pdfSha256: z.string(), pdfByteSize: z.number().int(), status: z.enum(GENERATED_DOCUMENT_STATUS_VALUES), voidedAt: z.iso.datetime().nullable(), voidReason: z.string().nullable(), pdfDownloadPath: z.string() });
export const generatedDocumentPreviewDtoSchema = z.object({ templateId: objectIdSchema, templateVersion: z.number().int(), versionLabel: z.string(), category: z.enum(DOCUMENT_CATEGORY_VALUES), title: z.string(), blocks: z.array(resolvedBlockSchema), context: contextSnapshotSchema, previewDigest: z.string(), generatedAtLabel: z.string() });

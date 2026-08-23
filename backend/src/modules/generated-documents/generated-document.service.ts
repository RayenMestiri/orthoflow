import type { TenantContext } from '../../common/types/auth.types.js';
import type { PaginationParams, PaginatedResult } from '../../common/types/common.types.js';
import { PERMISSIONS, type Permission } from '../../common/constants/permissions.js';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { hasPermission } from '../../common/authorization/policy.js';
import { ConflictError, ForbiddenError, NotFoundError, BusinessRuleError } from '../../common/errors/app-error.js';
import { sha256 } from '../../infrastructure/security/crypto.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { MEDIA_SCOPES } from '../../infrastructure/cloudinary/media.service.js';
import { securePdfArtifactService, type SecurePdfArtifactService } from '../../infrastructure/pdf/secure-pdf-artifact.service.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { documentContextService, type DocumentContextService } from './document-context.service.js';
import { generatedDocumentPdfService, type GeneratedDocumentPdfService } from './generated-document-pdf.service.js';
import { resolveDocumentBlocks, validateDocumentDefinition } from './document-variable.registry.js';
import { toDocumentTemplateDto, toGeneratedDocumentDto } from './generated-document.mapper.js';
import { documentTemplateRepository, generatedDocumentRepository, type DocumentTemplateListFilters, type DocumentTemplateRepository, type GeneratedDocumentRepository } from './generated-document.repository.js';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_TEMPLATE_STATUSES,
  GENERATED_DOCUMENT_STATUSES,
  type CreateDocumentTemplateInput,
  type DocumentCategory,
  type DocumentMutationContext,
  type DocumentTemplateDto,
  type FinalizeGeneratedDocumentInput,
  type GeneratedDocumentDto,
  type GeneratedDocumentPreviewDto,
  type PreviewGeneratedDocumentInput,
  type UpdateDocumentTemplateInput,
} from './generated-document.types.js';

const CATEGORY_PERMISSION: Readonly<Record<DocumentCategory, Permission>> = {
  [DOCUMENT_CATEGORIES.ATTENDANCE_CERTIFICATE]: PERMISSIONS.GENERATED_DOCUMENT_GENERATE_ADMINISTRATIVE,
  [DOCUMENT_CATEGORIES.PATIENT_SUMMARY]: PERMISSIONS.GENERATED_DOCUMENT_GENERATE_CLINICAL,
  [DOCUMENT_CATEGORIES.TREATMENT_SUMMARY]: PERMISSIONS.GENERATED_DOCUMENT_GENERATE_CLINICAL,
  [DOCUMENT_CATEGORIES.REFERRAL_LETTER]: PERMISSIONS.GENERATED_DOCUMENT_GENERATE_CLINICAL,
  [DOCUMENT_CATEGORIES.PAYMENT_STATEMENT]: PERMISSIONS.GENERATED_DOCUMENT_GENERATE_FINANCIAL,
  [DOCUMENT_CATEGORIES.RETENTION_SUMMARY]: PERMISSIONS.GENERATED_DOCUMENT_GENERATE_CLINICAL,
  [DOCUMENT_CATEGORIES.GENERAL]: PERMISSIONS.GENERATED_DOCUMENT_GENERATE_CLINICAL,
};

function assertCategoryPermission(tenant: TenantContext, category: DocumentCategory): void {
  if (!hasPermission(tenant, CATEGORY_PERMISSION[category])) throw new ForbiddenError('You cannot generate this document category', { code: ERROR_CODES.INSUFFICIENT_PERMISSIONS });
}
export class DocumentTemplateService {
  constructor(private readonly templates: DocumentTemplateRepository = documentTemplateRepository, private readonly audit: AuditLogService = auditLogService) {}
  async list(clinicId: string, filters: DocumentTemplateListFilters, pagination: PaginationParams): Promise<PaginatedResult<DocumentTemplateDto>> { const result = await this.templates.list(clinicId, filters, pagination); return { items: result.items.map(toDocumentTemplateDto), total: result.total }; }
  async create(clinicId: string, input: CreateDocumentTemplateInput, context: DocumentMutationContext): Promise<DocumentTemplateDto> {
    const existing = await this.templates.findLatestByCode(input.code, clinicId); if (existing) throw new ConflictError('Document template code already exists', { code: ERROR_CODES.DOCUMENT_TEMPLATE_CODE_TAKEN });
    const variablesUsed = validateDocumentDefinition(input.category, input.definition);
    const record = await withTransaction(async (session) => { const created = await this.templates.create(clinicId, input, 1, variablesUsed, context.actorUserId, session); await this.audit.record({ clinicId, actorUserId: context.actorUserId, action: AUDIT_ACTIONS.DOCUMENT_TEMPLATE_CREATED, resourceType: AUDIT_RESOURCE_TYPES.DOCUMENT_TEMPLATE, resourceId: created._id.toString(), metadata: { code: created.code, version: created.version, category: created.category }, ip: context.ip, userAgent: context.userAgent }, session); return created; });
    return toDocumentTemplateDto(record);
  }
  async updateDraft(clinicId: string, id: string, input: UpdateDocumentTemplateInput, context: DocumentMutationContext): Promise<DocumentTemplateDto> {
    const current = await this.requireTemplate(clinicId, id); if (current.status !== DOCUMENT_TEMPLATE_STATUSES.DRAFT) throw new BusinessRuleError('Only draft document templates can be edited', { code: ERROR_CODES.DOCUMENT_TEMPLATE_NOT_DRAFT });
    const category = input.category ?? current.category; const definition = input.definition ?? current.definition; const variablesUsed = validateDocumentDefinition(category, definition);
    const updated = await this.templates.updateDraft(id, clinicId, { ...input, variablesUsed }, context.actorUserId); if (!updated) throw new ConflictError('Document template changed before it could be updated', { code: ERROR_CODES.DOCUMENT_TEMPLATE_NOT_DRAFT });
    await this.audit.record({ clinicId, actorUserId: context.actorUserId, action: AUDIT_ACTIONS.DOCUMENT_TEMPLATE_UPDATED, resourceType: AUDIT_RESOURCE_TYPES.DOCUMENT_TEMPLATE, resourceId: id, metadata: { code: updated.code, version: updated.version }, ip: context.ip, userAgent: context.userAgent }); return toDocumentTemplateDto(updated);
  }
  async createVersion(clinicId: string, id: string, input: UpdateDocumentTemplateInput, context: DocumentMutationContext): Promise<DocumentTemplateDto> {
    const source = await this.requireTemplate(clinicId, id); const latest = await this.templates.findLatestByCode(source.code, clinicId); const category = input.category ?? source.category; const definition = input.definition ?? source.definition; const variablesUsed = validateDocumentDefinition(category, definition);
    const created = await this.templates.create(clinicId, { code: source.code, title: input.title ?? source.title, category, definition }, (latest?.version ?? source.version) + 1, variablesUsed, context.actorUserId); await this.audit.record({ clinicId, actorUserId: context.actorUserId, action: AUDIT_ACTIONS.DOCUMENT_TEMPLATE_CREATED, resourceType: AUDIT_RESOURCE_TYPES.DOCUMENT_TEMPLATE, resourceId: created._id.toString(), metadata: { code: created.code, version: created.version }, ip: context.ip, userAgent: context.userAgent }); return toDocumentTemplateDto(created);
  }
  async activate(clinicId: string, id: string, context: DocumentMutationContext): Promise<DocumentTemplateDto> { const template = await this.requireTemplate(clinicId, id); if (template.status !== DOCUMENT_TEMPLATE_STATUSES.DRAFT) throw new BusinessRuleError('Only a draft document template can be activated', { code: ERROR_CODES.DOCUMENT_TEMPLATE_NOT_DRAFT }); validateDocumentDefinition(template.category, template.definition); const at = new Date(); const updated = await withTransaction(async (session) => { const value = await this.templates.activate(template, context.actorUserId, at, session); if (!value) throw new ConflictError('Document template changed before activation', { code: ERROR_CODES.DOCUMENT_TEMPLATE_NOT_DRAFT }); await this.audit.record({ clinicId, actorUserId: context.actorUserId, action: AUDIT_ACTIONS.DOCUMENT_TEMPLATE_ACTIVATED, resourceType: AUDIT_RESOURCE_TYPES.DOCUMENT_TEMPLATE, resourceId: id, metadata: { code: value.code, version: value.version }, ip: context.ip, userAgent: context.userAgent }, session); return value; }); return toDocumentTemplateDto(updated); }
  async archive(clinicId: string, id: string, context: DocumentMutationContext): Promise<DocumentTemplateDto> { await this.requireTemplate(clinicId, id); const updated = await this.templates.archive(id, clinicId, context.actorUserId, new Date()); if (!updated) throw new ConflictError('Document template is already archived', { code: ERROR_CODES.DOCUMENT_TEMPLATE_NOT_DRAFT }); await this.audit.record({ clinicId, actorUserId: context.actorUserId, action: AUDIT_ACTIONS.DOCUMENT_TEMPLATE_ARCHIVED, resourceType: AUDIT_RESOURCE_TYPES.DOCUMENT_TEMPLATE, resourceId: id, metadata: { code: updated.code, version: updated.version }, ip: context.ip, userAgent: context.userAgent }); return toDocumentTemplateDto(updated); }
  private async requireTemplate(clinicId: string, id: string) { const template = await this.templates.findByIdInClinic(id, clinicId); if (!template) throw new NotFoundError('Document template not found', { code: ERROR_CODES.DOCUMENT_TEMPLATE_NOT_FOUND }); return template; }
}

export class GeneratedDocumentService {
  constructor(private readonly templates: DocumentTemplateRepository = documentTemplateRepository, private readonly documents: GeneratedDocumentRepository = generatedDocumentRepository, private readonly contexts: DocumentContextService = documentContextService, private readonly pdf: GeneratedDocumentPdfService = generatedDocumentPdfService, private readonly artifacts: SecurePdfArtifactService = securePdfArtifactService, private readonly audit: AuditLogService = auditLogService) {}
  async listForPatient(clinicId: string, patientId: string, pagination: PaginationParams): Promise<PaginatedResult<GeneratedDocumentDto>> { const result = await this.documents.listByPatient(clinicId, patientId, pagination); return { items: result.items.map(toGeneratedDocumentDto), total: result.total }; }
  async getById(clinicId: string, id: string): Promise<GeneratedDocumentDto> { return toGeneratedDocumentDto(await this.requireDocument(clinicId, id)); }
  async preview(clinicId: string, patientId: string, input: PreviewGeneratedDocumentInput, tenant: TenantContext, actorUserId: string): Promise<GeneratedDocumentPreviewDto> {
    const template = await this.requireActiveTemplate(clinicId, input.templateId); assertCategoryPermission(tenant, template.category); const selection = { ...input }; delete (selection as { templateId?: string }).templateId;
    const context = await this.contexts.resolve(clinicId, patientId, template.category, selection, actorUserId); const blocks = resolveDocumentBlocks(template.definition, context.values, context.tables); const previewDigest = sha256(JSON.stringify({ templateId: template._id.toString(), version: template.version, updatedAt: template.updatedAt.toISOString(), patientId, selection, snapshot: context.snapshot }));
    return { templateId: template._id.toString(), templateVersion: template.version, versionLabel: `v${template.version}`, category: template.category, title: template.title, blocks, context: context.snapshot, previewDigest, generatedAtLabel: context.generatedAtLabel };
  }
  async finalize(clinicId: string, patientId: string, input: FinalizeGeneratedDocumentInput, tenant: TenantContext, context: DocumentMutationContext): Promise<GeneratedDocumentDto> {
    const payloadDigest = sha256(JSON.stringify({ patientId, input })); const replay = await this.documents.findByIdempotencyKey(input.idempotencyKey, clinicId); if (replay) { if (replay.payloadDigest !== payloadDigest) throw new ConflictError('Idempotency key was already used for another document', { code: ERROR_CODES.GENERATED_DOCUMENT_IDEMPOTENCY_CONFLICT }); return toGeneratedDocumentDto(replay); }
    const template = await this.requireActiveTemplate(clinicId, input.templateId); assertCategoryPermission(tenant, template.category); const selection = { ...input }; delete (selection as { templateId?: string }).templateId; delete (selection as { previewDigest?: string }).previewDigest; delete (selection as { idempotencyKey?: string }).idempotencyKey;
    const resolved = await this.contexts.resolve(clinicId, patientId, template.category, selection, context.actorUserId); const expectedDigest = sha256(JSON.stringify({ templateId: template._id.toString(), version: template.version, updatedAt: template.updatedAt.toISOString(), patientId, selection, snapshot: resolved.snapshot })); if (expectedDigest !== input.previewDigest) throw new ConflictError('Document preview is stale; review the latest data before finalizing', { code: ERROR_CODES.DOCUMENT_PREVIEW_STALE });
    const blocks = resolveDocumentBlocks(template.definition, resolved.values, resolved.tables); const documentRef = await this.documents.reserveReference(clinicId, resolved.generatedAt.getUTCFullYear()); const pdf = await this.pdf.render({ title: template.title, documentRef, generatedAt: resolved.generatedAt, clinic: resolved.clinicBranding, blocks });
    const artifact = await this.artifacts.store({ clinicId, scope: MEDIA_SCOPES.GENERATED_DOCUMENTS, subfolders: [patientId], fileName: `${documentRef}.pdf`, content: pdf });
    try { const record = await withTransaction(async (session) => { const created = await this.documents.create({ clinicId, patientId, documentRef, templateId: template._id.toString(), templateCode: template.code, templateVersion: template.version, category: template.category, titleSnapshot: template.title, contentSnapshot: blocks, contextSnapshot: resolved.snapshot, generatedByUserId: context.actorUserId, generatedByNameSnapshot: resolved.generatedByName, generatedAt: resolved.generatedAt, finalizedPdf: artifact, idempotencyKey: input.idempotencyKey, payloadDigest, status: GENERATED_DOCUMENT_STATUSES.FINALIZED, voidedAt: null, voidReason: null }, session); await this.audit.record({ clinicId, actorUserId: context.actorUserId, action: AUDIT_ACTIONS.GENERATED_DOCUMENT_FINALIZED, resourceType: AUDIT_RESOURCE_TYPES.GENERATED_DOCUMENT, resourceId: created._id.toString(), metadata: { documentRef, patientId, category: template.category, templateCode: template.code, templateVersion: template.version }, ip: context.ip, userAgent: context.userAgent }, session); return created; }); return toGeneratedDocumentDto(record); } catch (error) { await this.artifacts.remove(artifact).catch(() => undefined); throw error; }
  }
  async downloadPdf(clinicId: string, id: string): Promise<{ content: Buffer; fileName: string }> { const document = await this.requireDocument(clinicId, id); return { content: await this.artifacts.downloadVerified(document.finalizedPdf), fileName: `${document.documentRef}.pdf` }; }
  async void(clinicId: string, id: string, reason: string, context: DocumentMutationContext): Promise<GeneratedDocumentDto> { const current = await this.requireDocument(clinicId, id); if (current.status === GENERATED_DOCUMENT_STATUSES.VOIDED) throw new ConflictError('Document is already voided', { code: ERROR_CODES.GENERATED_DOCUMENT_ALREADY_VOIDED }); const at = new Date(); const updated = await withTransaction(async (session) => { const value = await this.documents.void(id, clinicId, context.actorUserId, reason, at, session); if (!value) throw new ConflictError('Document is already voided', { code: ERROR_CODES.GENERATED_DOCUMENT_ALREADY_VOIDED }); await this.audit.record({ clinicId, actorUserId: context.actorUserId, action: AUDIT_ACTIONS.GENERATED_DOCUMENT_VOIDED, resourceType: AUDIT_RESOURCE_TYPES.GENERATED_DOCUMENT, resourceId: id, metadata: { documentRef: value.documentRef, reason }, ip: context.ip, userAgent: context.userAgent }, session); return value; }); return toGeneratedDocumentDto(updated); }
  private async requireActiveTemplate(clinicId: string, id: string) { const template = await this.templates.findByIdInClinic(id, clinicId); if (!template) throw new NotFoundError('Document template not found', { code: ERROR_CODES.DOCUMENT_TEMPLATE_NOT_FOUND }); if (template.status !== DOCUMENT_TEMPLATE_STATUSES.ACTIVE) throw new BusinessRuleError('Document template is not active', { code: ERROR_CODES.DOCUMENT_TEMPLATE_NOT_ACTIVE }); return template; }
  private async requireDocument(clinicId: string, id: string) { const document = await this.documents.findByIdInClinic(id, clinicId); if (!document) throw new NotFoundError('Generated document not found', { code: ERROR_CODES.GENERATED_DOCUMENT_NOT_FOUND }); return document; }
}

export const documentTemplateService = new DocumentTemplateService();
export const generatedDocumentService = new GeneratedDocumentService();

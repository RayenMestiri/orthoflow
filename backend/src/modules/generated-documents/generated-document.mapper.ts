import type { DocumentTemplateDto, DocumentTemplateRecord, GeneratedDocumentDto, GeneratedDocumentRecord } from './generated-document.types.js';

export function toDocumentTemplateDto(record: DocumentTemplateRecord): DocumentTemplateDto {
  return { id: record._id.toString(), code: record.code, version: record.version, versionLabel: `v${record.version}`, title: record.title, category: record.category, definition: record.definition, variablesUsed: record.variablesUsed, status: record.status, activatedAt: record.activatedAt?.toISOString() ?? null, archivedAt: record.archivedAt?.toISOString() ?? null, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() };
}

export function toGeneratedDocumentDto(record: GeneratedDocumentRecord): GeneratedDocumentDto {
  const now = new Date();
  const expiresAt = record.retentionExpiresAt ?? new Date(record.generatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const isExpired = record.status === 'EXPIRED' || record.deletedAt !== null || now >= expiresAt;
  const diffMs = expiresAt.getTime() - now.getTime();
  const expiresInDays = isExpired ? null : Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));

  return {
    id: record._id.toString(),
    patientId: record.patientId.toString(),
    documentRef: record.documentRef,
    templateId: record.templateId.toString(),
    templateCode: record.templateCode,
    templateVersion: record.templateVersion,
    versionLabel: `v${record.templateVersion}`,
    category: record.category,
    title: record.titleSnapshot,
    contentSnapshot: record.contentSnapshot,
    contextSnapshot: record.contextSnapshot,
    generatedByName: record.generatedByNameSnapshot,
    generatedAt: record.generatedAt.toISOString(),
    retentionExpiresAt: expiresAt.toISOString(),
    isExpired,
    expiresInDays,
    deletedAt: record.deletedAt?.toISOString() ?? null,
    pdfSha256: record.finalizedPdf?.sha256 ?? null,
    pdfByteSize: record.finalizedPdf?.byteSize ?? null,
    status: record.status,
    voidedAt: record.voidedAt?.toISOString() ?? null,
    voidReason: record.voidReason,
    pdfDownloadPath: `/api/v1/generated-documents/${record._id.toString()}/pdf`,
  };
}

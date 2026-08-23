import type {
  ConsentTemplateDto,
  ConsentTemplateRecord,
  SignedConsentDto,
  SignedConsentRecord,
} from './consent.types.js';

export function toConsentTemplateDto(record: ConsentTemplateRecord): ConsentTemplateDto {
  return {
    id: record._id.toString(),
    code: record.code,
    version: record.version,
    versionLabel: `v${record.version}`,
    title: record.title,
    category: record.category,
    content: record.content,
    status: record.status,
    activatedAt: record.activatedAt?.toISOString() ?? null,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toSignedConsentDto(record: SignedConsentRecord): SignedConsentDto {
  return {
    id: record._id.toString(),
    patientId: record.patientId.toString(),
    treatmentId: record.treatmentId?.toString() ?? null,
    retentionPlanId: record.retentionPlanId?.toString() ?? null,
    consentRef: record.consentRef,
    templateId: record.templateId.toString(),
    templateCode: record.templateCode,
    templateVersion: record.templateVersion,
    versionLabel: `v${record.templateVersion}`,
    category: record.category,
    title: record.titleSnapshot,
    contentSnapshot: record.contentSnapshot,
    patientName: record.patientNameSnapshot,
    signerType: record.signerType,
    guardianId: record.guardianId?.toString() ?? null,
    signerName: record.signerNameSnapshot,
    signerRelationship: record.signerRelationshipSnapshot,
    status: record.status,
    signedAt: record.signedAt.toISOString(),
    presentedByName: record.presentedByNameSnapshot,
    pdfSha256: record.finalizedPdf.sha256,
    pdfByteSize: record.finalizedPdf.byteSize,
    pdfDownloadPath: `/api/v1/consents/${record._id.toString()}/pdf`,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    revocationReason: record.revocationReason,
    voidedAt: record.voidedAt?.toISOString() ?? null,
    voidReason: record.voidReason,
  };
}

import type { Types } from 'mongoose';
import type { SecurePdfArtifact } from '../../infrastructure/pdf/secure-pdf-artifact.service.js';
import type { MutationContext } from '../../common/utils/request-context.js';

export const DOCUMENT_CATEGORIES = {
  ATTENDANCE_CERTIFICATE: 'ATTENDANCE_CERTIFICATE',
  PATIENT_SUMMARY: 'PATIENT_SUMMARY',
  TREATMENT_SUMMARY: 'TREATMENT_SUMMARY',
  REFERRAL_LETTER: 'REFERRAL_LETTER',
  PAYMENT_STATEMENT: 'PAYMENT_STATEMENT',
  RETENTION_SUMMARY: 'RETENTION_SUMMARY',
  GENERAL: 'GENERAL',
} as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[keyof typeof DOCUMENT_CATEGORIES];
export const DOCUMENT_CATEGORY_VALUES = Object.values(DOCUMENT_CATEGORIES) as [
  DocumentCategory,
  ...DocumentCategory[],
];

export const DOCUMENT_TEMPLATE_STATUSES = {
  DRAFT: 'DRAFT', ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED',
} as const;
export type DocumentTemplateStatus =
  (typeof DOCUMENT_TEMPLATE_STATUSES)[keyof typeof DOCUMENT_TEMPLATE_STATUSES];
export const DOCUMENT_TEMPLATE_STATUS_VALUES = Object.values(DOCUMENT_TEMPLATE_STATUSES) as [
  DocumentTemplateStatus,
  ...DocumentTemplateStatus[],
];

export const GENERATED_DOCUMENT_STATUSES = { FINALIZED: 'FINALIZED', VOIDED: 'VOIDED' } as const;
export type GeneratedDocumentStatus =
  (typeof GENERATED_DOCUMENT_STATUSES)[keyof typeof GENERATED_DOCUMENT_STATUSES];
export const GENERATED_DOCUMENT_STATUS_VALUES = Object.values(GENERATED_DOCUMENT_STATUSES) as [
  GeneratedDocumentStatus,
  ...GeneratedDocumentStatus[],
];

export const DOCUMENT_BLOCK_KINDS = {
  HEADING: 'HEADING', PARAGRAPH: 'PARAGRAPH', DIVIDER: 'DIVIDER', KEY_VALUE: 'KEY_VALUE',
  DATA_TABLE: 'DATA_TABLE', SIGNATURE_LINE: 'SIGNATURE_LINE',
} as const;
export type DocumentBlockKind = (typeof DOCUMENT_BLOCK_KINDS)[keyof typeof DOCUMENT_BLOCK_KINDS];
export const DOCUMENT_BLOCK_KIND_VALUES = Object.values(DOCUMENT_BLOCK_KINDS) as [
  DocumentBlockKind,
  ...DocumentBlockKind[],
];

export const DOCUMENT_TABLE_SOURCES = {
  FINANCE_RECORDS: 'FINANCE_RECORDS', RETENTION_DEVICES: 'RETENTION_DEVICES',
  TREATMENT_MILESTONES: 'TREATMENT_MILESTONES',
} as const;
export type DocumentTableSource =
  (typeof DOCUMENT_TABLE_SOURCES)[keyof typeof DOCUMENT_TABLE_SOURCES];
export const DOCUMENT_TABLE_SOURCE_VALUES = Object.values(DOCUMENT_TABLE_SOURCES) as [
  DocumentTableSource,
  ...DocumentTableSource[],
];

export interface DocumentTableColumn { key: string; label: string }
export interface DocumentBlock {
  kind: DocumentBlockKind;
  text?: string;
  level?: 1 | 2;
  label?: string;
  value?: string;
  omitWhenEmpty?: boolean;
  source?: DocumentTableSource;
  columns?: DocumentTableColumn[];
}
export interface ResolvedDocumentRow { cells: Array<{ key: string; value: string }> }
export interface ResolvedDocumentBlock extends DocumentBlock { rows?: ResolvedDocumentRow[] }

export interface DocumentTemplateAttributes {
  clinicId: Types.ObjectId;
  code: string;
  version: number;
  title: string;
  category: DocumentCategory;
  definition: DocumentBlock[];
  variablesUsed: string[];
  status: DocumentTemplateStatus;
  createdByUserId: Types.ObjectId;
  updatedByUserId: Types.ObjectId;
  activatedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export type DocumentTemplateRecord = DocumentTemplateAttributes & { _id: Types.ObjectId };

export interface GeneratedDocumentContextSnapshot {
  patient: { id: string; fullName: string; birthDate: string | null; referenceNumber: string | null };
  guardian: { id: string; fullName: string; relationship: string } | null;
  treatment: { id: string; label: string; status: string; startDate: string | null; completedAt: string | null } | null;
  retention: { id: string; status: string; startedAt: string | null; nextControlAt: string | null } | null;
  appointment: { id: string; scheduledAt: string; status: string; typeLabel: string } | null;
  finance: { from: string; to: string; totalRecordedMinor: number; currency: string; recordCount: number } | null;
}

export interface GeneratedDocumentAttributes {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  documentRef: string;
  templateId: Types.ObjectId;
  templateCode: string;
  templateVersion: number;
  category: DocumentCategory;
  titleSnapshot: string;
  contentSnapshot: ResolvedDocumentBlock[];
  contextSnapshot: GeneratedDocumentContextSnapshot;
  generatedByUserId: Types.ObjectId;
  generatedByNameSnapshot: string;
  generatedAt: Date;
  finalizedPdf: SecurePdfArtifact;
  idempotencyKey: string;
  payloadDigest: string;
  status: GeneratedDocumentStatus;
  voidedAt: Date | null;
  voidedByUserId: Types.ObjectId | null;
  voidReason: string | null;
  createdAt: Date;
}
export type GeneratedDocumentRecord = GeneratedDocumentAttributes & { _id: Types.ObjectId };

export interface DocumentContextSelection {
  guardianId?: string | null;
  treatmentId?: string | null;
  retentionPlanId?: string | null;
  appointmentId?: string | null;
  from?: string | null;
  to?: string | null;
  referralRecipient?: string | null;
  referralReason?: string | null;
  referralMessage?: string | null;
  selectedMilestoneIds?: string[];
}
export interface FinalizeGeneratedDocumentInput extends DocumentContextSelection {
  templateId: string;
  previewDigest: string;
  idempotencyKey: string;
}
export interface PreviewGeneratedDocumentInput extends DocumentContextSelection { templateId: string }
export interface CreateDocumentTemplateInput {
  code: string; title: string; category: DocumentCategory; definition: DocumentBlock[];
}
export interface UpdateDocumentTemplateInput {
  title?: string; category?: DocumentCategory; definition?: DocumentBlock[];
}
export interface DocumentMutationContext extends MutationContext { actorUserId: string }

export interface DocumentTemplateDto {
  id: string; code: string; version: number; versionLabel: string; title: string;
  category: DocumentCategory; definition: DocumentBlock[]; variablesUsed: string[];
  status: DocumentTemplateStatus; activatedAt: string | null; archivedAt: string | null;
  createdAt: string; updatedAt: string;
}
export interface GeneratedDocumentDto {
  id: string; patientId: string; documentRef: string; templateId: string; templateCode: string;
  templateVersion: number; versionLabel: string; category: DocumentCategory; title: string;
  contentSnapshot: ResolvedDocumentBlock[]; contextSnapshot: GeneratedDocumentContextSnapshot;
  generatedByName: string; generatedAt: string; pdfSha256: string; pdfByteSize: number;
  status: GeneratedDocumentStatus; voidedAt: string | null; voidReason: string | null;
  pdfDownloadPath: string;
}
export interface GeneratedDocumentPreviewDto {
  templateId: string; templateVersion: number; versionLabel: string; category: DocumentCategory;
  title: string; blocks: ResolvedDocumentBlock[]; context: GeneratedDocumentContextSnapshot;
  previewDigest: string; generatedAtLabel: string;
}

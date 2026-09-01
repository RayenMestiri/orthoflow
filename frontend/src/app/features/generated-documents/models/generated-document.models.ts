export const DOCUMENT_CATEGORIES = ['ATTENDANCE_CERTIFICATE', 'PATIENT_SUMMARY', 'TREATMENT_SUMMARY', 'REFERRAL_LETTER', 'PAYMENT_STATEMENT', 'RETENTION_SUMMARY', 'GENERAL'] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_CATEGORY_LABELS: Readonly<Record<DocumentCategory, string>> = { ATTENDANCE_CERTIFICATE: 'Attendance certificate', PATIENT_SUMMARY: 'Patient summary', TREATMENT_SUMMARY: 'Treatment summary', REFERRAL_LETTER: 'Referral letter', PAYMENT_STATEMENT: 'Payment statement', RETENTION_SUMMARY: 'Retention summary', GENERAL: 'General document' };
export type DocumentTemplateStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type GeneratedDocumentStatus = 'FINALIZED' | 'VOIDED' | 'EXPIRED';
export interface DocumentColumn { key: string; label: string }
export interface DocumentRow { cells: { key: string; value: string }[] }
export interface DocumentBlock { kind: 'HEADING' | 'PARAGRAPH' | 'DIVIDER' | 'KEY_VALUE' | 'DATA_TABLE' | 'SIGNATURE_LINE'; text?: string; level?: 1 | 2; label?: string; value?: string; omitWhenEmpty?: boolean; source?: 'FINANCE_RECORDS' | 'RETENTION_DEVICES' | 'TREATMENT_MILESTONES'; columns?: DocumentColumn[]; rows?: DocumentRow[] }
export interface DocumentTemplate { id: string; code: string; version: number; versionLabel: string; title: string; category: DocumentCategory; definition: DocumentBlock[]; variablesUsed: string[]; status: DocumentTemplateStatus; activatedAt: string | null; archivedAt: string | null; createdAt: string; updatedAt: string }
export interface GeneratedDocument {
  id: string;
  patientId: string;
  documentRef: string;
  templateId: string;
  templateCode: string;
  templateVersion: number;
  versionLabel: string;
  category: DocumentCategory;
  title: string;
  contentSnapshot: DocumentBlock[];
  contextSnapshot: unknown;
  generatedByName: string;
  generatedAt: string;
  retentionExpiresAt: string;
  isExpired: boolean;
  expiresInDays: number | null;
  deletedAt: string | null;
  pdfSha256: string | null;
  pdfByteSize: number | null;
  status: GeneratedDocumentStatus;
  voidedAt: string | null;
  voidReason: string | null;
  pdfDownloadPath: string;
}
export interface DocumentSelection { templateId: string; guardianId?: string | null; treatmentId?: string | null; retentionPlanId?: string | null; appointmentId?: string | null; from?: string | null; to?: string | null; referralRecipient?: string | null; referralReason?: string | null; referralMessage?: string | null; selectedMilestoneIds?: string[] }
export interface GeneratedDocumentPreview { templateId: string; templateVersion: number; versionLabel: string; category: DocumentCategory; title: string; blocks: DocumentBlock[]; context: unknown; previewDigest: string; generatedAtLabel: string }

export const CONSENT_CATEGORIES = ['TREATMENT', 'MEDIA', 'PRIVACY', 'RETENTION', 'GENERAL'] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];
export type ConsentTemplateStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type ConsentSignerType = 'PATIENT' | 'GUARDIAN';
export type SignedConsentStatus = 'SIGNED' | 'REVOKED' | 'VOIDED';

export interface ConsentTemplate {
  id: string;
  code: string;
  version: number;
  versionLabel: string;
  title: string;
  category: ConsentCategory;
  content: string;
  status: ConsentTemplateStatus;
  activatedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentTemplateInput {
  code: string;
  title: string;
  category: ConsentCategory;
  content: string;
}

export interface ConsentSigningSelection {
  templateId: string;
  signerType: ConsentSignerType;
  guardianId?: string | null;
  treatmentId?: string | null;
  retentionPlanId?: string | null;
}

export interface ConsentPreview extends ConsentSigningSelection {
  templateCode: string;
  templateVersion: number;
  versionLabel: string;
  category: ConsentCategory;
  title: string;
  renderedContent: string;
  patientName: string;
  guardianId: string | null;
  signerName: string;
  signerRelationship: string | null;
  presentedByName: string;
  signingDate: string;
}

export interface SignedConsent {
  id: string;
  patientId: string;
  treatmentId: string | null;
  retentionPlanId: string | null;
  consentRef: string;
  templateId: string;
  templateCode: string;
  templateVersion: number;
  versionLabel: string;
  category: ConsentCategory;
  title: string;
  contentSnapshot: string;
  patientName: string;
  signerType: ConsentSignerType;
  guardianId: string | null;
  signerName: string;
  signerRelationship: string | null;
  status: SignedConsentStatus;
  signedAt: string;
  presentedByName: string;
  pdfSha256: string;
  pdfByteSize: number;
  pdfDownloadPath: string;
  revokedAt: string | null;
  revocationReason: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface ConsentGuardianOption {
  id: string;
  fullName: string;
  relationship: string;
  isPrimary: boolean;
}

export const CONSENT_CATEGORY_LABELS: Record<ConsentCategory, string> = {
  TREATMENT: 'Treatment',
  MEDIA: 'Media',
  PRIVACY: 'Privacy',
  RETENTION: 'Retention',
  GENERAL: 'General',
};

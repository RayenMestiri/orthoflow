import type { Types } from 'mongoose';
import type { MutationContext } from '../../common/utils/request-context.js';

export const CONSENT_CATEGORIES = {
  TREATMENT: 'TREATMENT',
  MEDIA: 'MEDIA',
  PRIVACY: 'PRIVACY',
  RETENTION: 'RETENTION',
  GENERAL: 'GENERAL',
} as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[keyof typeof CONSENT_CATEGORIES];
export const CONSENT_CATEGORY_VALUES = Object.values(CONSENT_CATEGORIES) as [
  ConsentCategory,
  ...ConsentCategory[],
];

export const CONSENT_TEMPLATE_STATUSES = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ConsentTemplateStatus =
  (typeof CONSENT_TEMPLATE_STATUSES)[keyof typeof CONSENT_TEMPLATE_STATUSES];
export const CONSENT_TEMPLATE_STATUS_VALUES = Object.values(CONSENT_TEMPLATE_STATUSES) as [
  ConsentTemplateStatus,
  ...ConsentTemplateStatus[],
];

export interface ConsentTemplateAttributes {
  clinicId: Types.ObjectId;
  /** Stable family identifier; every version of one document shares this code. */
  code: string;
  version: number;
  title: string;
  category: ConsentCategory;
  /** Plain text with strict allowlisted placeholders; never executable markup. */
  content: string;
  status: ConsentTemplateStatus;
  createdByUserId: Types.ObjectId;
  updatedByUserId: Types.ObjectId;
  activatedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export type ConsentTemplateRecord = ConsentTemplateAttributes & { _id: Types.ObjectId };

export interface ConsentTemplateDto {
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

export interface CreateConsentTemplateInput {
  code: string;
  title: string;
  category: ConsentCategory;
  content: string;
}

export interface UpdateConsentTemplateInput {
  title?: string;
  category?: ConsentCategory;
  content?: string;
}

export const CONSENT_SIGNER_TYPES = {
  PATIENT: 'PATIENT',
  GUARDIAN: 'GUARDIAN',
} as const;
export type ConsentSignerType =
  (typeof CONSENT_SIGNER_TYPES)[keyof typeof CONSENT_SIGNER_TYPES];
export const CONSENT_SIGNER_TYPE_VALUES = Object.values(CONSENT_SIGNER_TYPES) as [
  ConsentSignerType,
  ...ConsentSignerType[],
];

export const SIGNED_CONSENT_STATUSES = {
  SIGNED: 'SIGNED',
  REVOKED: 'REVOKED',
  VOIDED: 'VOIDED',
} as const;
export type SignedConsentStatus =
  (typeof SIGNED_CONSENT_STATUSES)[keyof typeof SIGNED_CONSENT_STATUSES];
export const SIGNED_CONSENT_STATUS_VALUES = Object.values(SIGNED_CONSENT_STATUSES) as [
  SignedConsentStatus,
  ...SignedConsentStatus[],
];

export interface ConsentArtifact {
  provider: 'CLOUDINARY';
  publicId: string;
  resourceType: string;
  deliveryType: 'authenticated';
  mimeType: string;
  byteSize: number;
  sha256: string;
}

export interface SignedConsentAttributes {
  clinicId: Types.ObjectId;
  patientId: Types.ObjectId;
  treatmentId: Types.ObjectId | null;
  retentionPlanId: Types.ObjectId | null;
  consentRef: string;
  templateId: Types.ObjectId;
  templateCode: string;
  templateVersion: number;
  category: ConsentCategory;
  titleSnapshot: string;
  contentSnapshot: string;
  patientNameSnapshot: string;
  signerType: ConsentSignerType;
  guardianId: Types.ObjectId | null;
  signerNameSnapshot: string;
  signerRelationshipSnapshot: string | null;
  status: SignedConsentStatus;
  signedAt: Date;
  presentedByUserId: Types.ObjectId;
  presentedByNameSnapshot: string;
  signatureArtifact: ConsentArtifact;
  finalizedPdf: ConsentArtifact;
  idempotencyKey: string;
  payloadDigest: string;
  revokedAt: Date | null;
  revokedByUserId: Types.ObjectId | null;
  revocationReason: string | null;
  voidedAt: Date | null;
  voidedByUserId: Types.ObjectId | null;
  voidReason: string | null;
  createdAt: Date;
}
export type SignedConsentRecord = SignedConsentAttributes & { _id: Types.ObjectId };

export interface SignedConsentDto {
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

export interface ConsentSigningInput {
  templateId: string;
  signerType: ConsentSignerType;
  guardianId?: string | null;
  treatmentId?: string | null;
  retentionPlanId?: string | null;
  idempotencyKey: string;
  acknowledgement: boolean;
}

export interface ConsentSignatureFile {
  content: Buffer;
  originalFileName: string;
  mimeType: 'image/png';
  width: number;
  height: number;
}

export interface ConsentPreviewDto {
  templateId: string;
  templateCode: string;
  templateVersion: number;
  versionLabel: string;
  category: ConsentCategory;
  title: string;
  renderedContent: string;
  patientName: string;
  signerType: ConsentSignerType;
  guardianId: string | null;
  signerName: string;
  signerRelationship: string | null;
  presentedByName: string;
  signingDate: string;
}

export type ConsentMutationContext = MutationContext;

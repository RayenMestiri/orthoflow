import { Schema, model } from 'mongoose';
import {
  CONSENT_CATEGORY_VALUES,
  CONSENT_TEMPLATE_STATUSES,
  CONSENT_TEMPLATE_STATUS_VALUES,
  CONSENT_SIGNER_TYPE_VALUES,
  SIGNED_CONSENT_STATUSES,
  SIGNED_CONSENT_STATUS_VALUES,
  type ConsentArtifact,
  type ConsentTemplateAttributes,
  type SignedConsentAttributes,
} from './consent.types.js';

const consentTemplateSchema = new Schema<ConsentTemplateAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 48 },
    version: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    category: { type: String, enum: CONSENT_CATEGORY_VALUES, required: true },
    content: { type: String, required: true, maxlength: 20_000 },
    status: {
      type: String,
      enum: CONSENT_TEMPLATE_STATUS_VALUES,
      default: CONSENT_TEMPLATE_STATUSES.DRAFT,
      required: true,
    },
    createdByUserId: { type: Schema.Types.ObjectId, required: true },
    updatedByUserId: { type: Schema.Types.ObjectId, required: true },
    activatedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  {
    collection: 'consentTemplates',
    timestamps: true,
    strict: 'throw',
    versionKey: false,
  },
);
consentTemplateSchema.index({ clinicId: 1, code: 1, version: 1 }, { unique: true });
consentTemplateSchema.index({ clinicId: 1, status: 1, category: 1, updatedAt: -1 });
consentTemplateSchema.index(
  { clinicId: 1, code: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: CONSENT_TEMPLATE_STATUSES.ACTIVE },
    name: 'clinic_consent_code_single_active',
  },
);

const artifactSchema = new Schema<ConsentArtifact>(
  {
    provider: { type: String, enum: ['CLOUDINARY'], required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, required: true },
    deliveryType: { type: String, enum: ['authenticated'], required: true },
    mimeType: { type: String, required: true },
    byteSize: { type: Number, required: true, min: 1 },
    sha256: { type: String, required: true, minlength: 64, maxlength: 64 },
  },
  { _id: false, strict: 'throw' },
);

const signedConsentSchema = new Schema<SignedConsentAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, required: true, index: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, required: true, index: true, immutable: true },
    treatmentId: { type: Schema.Types.ObjectId, default: null, index: true, immutable: true },
    retentionPlanId: { type: Schema.Types.ObjectId, default: null, index: true, immutable: true },
    consentRef: { type: String, required: true, maxlength: 32, immutable: true },
    templateId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    templateCode: { type: String, required: true, maxlength: 48, immutable: true },
    templateVersion: { type: Number, required: true, min: 1, immutable: true },
    category: { type: String, enum: CONSENT_CATEGORY_VALUES, required: true, immutable: true },
    titleSnapshot: { type: String, required: true, maxlength: 160, immutable: true },
    contentSnapshot: { type: String, required: true, maxlength: 25_000, immutable: true },
    patientNameSnapshot: { type: String, required: true, maxlength: 180, immutable: true },
    signerType: { type: String, enum: CONSENT_SIGNER_TYPE_VALUES, required: true, immutable: true },
    guardianId: { type: Schema.Types.ObjectId, default: null, immutable: true },
    signerNameSnapshot: { type: String, required: true, maxlength: 180, immutable: true },
    signerRelationshipSnapshot: { type: String, default: null, maxlength: 80, immutable: true },
    status: {
      type: String,
      enum: SIGNED_CONSENT_STATUS_VALUES,
      default: SIGNED_CONSENT_STATUSES.SIGNED,
      required: true,
    },
    signedAt: { type: Date, required: true, immutable: true },
    presentedByUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    presentedByNameSnapshot: { type: String, required: true, maxlength: 180, immutable: true },
    signatureArtifact: { type: artifactSchema, required: true, immutable: true },
    finalizedPdf: { type: artifactSchema, required: true, immutable: true },
    idempotencyKey: { type: String, required: true, maxlength: 64, immutable: true },
    payloadDigest: { type: String, required: true, minlength: 64, maxlength: 64, immutable: true },
    revokedAt: { type: Date, default: null },
    revokedByUserId: { type: Schema.Types.ObjectId, default: null },
    revocationReason: { type: String, default: null, maxlength: 500 },
    voidedAt: { type: Date, default: null },
    voidedByUserId: { type: Schema.Types.ObjectId, default: null },
    voidReason: { type: String, default: null, maxlength: 500 },
  },
  {
    collection: 'signedConsents',
    timestamps: { createdAt: true, updatedAt: false },
    strict: 'throw',
    versionKey: false,
  },
);
signedConsentSchema.index({ clinicId: 1, patientId: 1, signedAt: -1 });
signedConsentSchema.index({ clinicId: 1, consentRef: 1 }, { unique: true });
signedConsentSchema.index({ clinicId: 1, idempotencyKey: 1 }, { unique: true });
signedConsentSchema.index({ clinicId: 1, treatmentId: 1, signedAt: -1 });
signedConsentSchema.index({ clinicId: 1, retentionPlanId: 1, signedAt: -1 });

export const ConsentTemplateModel = model<ConsentTemplateAttributes>(
  'ConsentTemplate',
  consentTemplateSchema,
);
export const SignedConsentModel = model<SignedConsentAttributes>(
  'SignedConsent',
  signedConsentSchema,
);

import { Schema, model } from 'mongoose';
import {
  DOCUMENT_BLOCK_KIND_VALUES,
  DOCUMENT_CATEGORY_VALUES,
  DOCUMENT_TABLE_SOURCE_VALUES,
  DOCUMENT_TEMPLATE_STATUSES,
  DOCUMENT_TEMPLATE_STATUS_VALUES,
  GENERATED_DOCUMENT_STATUSES,
  GENERATED_DOCUMENT_STATUS_VALUES,
  type DocumentTemplateAttributes,
  type GeneratedDocumentAttributes,
} from './generated-document.types.js';

const columnSchema = new Schema({ key: { type: String, required: true }, label: { type: String, required: true } }, { _id: false, strict: 'throw' });
const cellSchema = new Schema({ key: { type: String, required: true }, value: { type: String, required: true } }, { _id: false, strict: 'throw' });
const rowSchema = new Schema({ cells: { type: [cellSchema], default: [] } }, { _id: false, strict: 'throw' });
const blockSchema = new Schema(
  {
    kind: { type: String, enum: DOCUMENT_BLOCK_KIND_VALUES, required: true },
    text: { type: String, maxlength: 4000 }, level: { type: Number, enum: [1, 2] },
    label: { type: String, maxlength: 160 }, value: { type: String, maxlength: 4000 },
    omitWhenEmpty: { type: Boolean }, source: { type: String, enum: DOCUMENT_TABLE_SOURCE_VALUES },
    columns: { type: [columnSchema], default: undefined }, rows: { type: [rowSchema], default: undefined },
  },
  { _id: false, strict: 'throw' },
);

const templateSchema = new Schema<DocumentTemplateAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, required: true, index: true },
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 48 },
    version: { type: Number, required: true, min: 1 }, title: { type: String, required: true, trim: true, maxlength: 160 },
    category: { type: String, enum: DOCUMENT_CATEGORY_VALUES, required: true },
    definition: { type: [blockSchema], required: true }, variablesUsed: { type: [String], default: [] },
    status: { type: String, enum: DOCUMENT_TEMPLATE_STATUS_VALUES, default: DOCUMENT_TEMPLATE_STATUSES.DRAFT, required: true },
    createdByUserId: { type: Schema.Types.ObjectId, required: true }, updatedByUserId: { type: Schema.Types.ObjectId, required: true },
    activatedAt: { type: Date, default: null }, archivedAt: { type: Date, default: null },
  },
  { collection: 'documentTemplates', timestamps: true, strict: 'throw', versionKey: false },
);
templateSchema.index({ clinicId: 1, code: 1, version: 1 }, { unique: true });
templateSchema.index({ clinicId: 1, status: 1, category: 1, updatedAt: -1 });
templateSchema.index({ clinicId: 1, code: 1, status: 1 }, { unique: true, partialFilterExpression: { status: DOCUMENT_TEMPLATE_STATUSES.ACTIVE }, name: 'clinic_document_code_single_active' });

const artifactSchema = new Schema({ provider: { type: String, enum: ['CLOUDINARY'], required: true }, publicId: { type: String, required: true }, resourceType: { type: String, required: true }, deliveryType: { type: String, enum: ['authenticated'], required: true }, mimeType: { type: String, enum: ['application/pdf'], required: true }, byteSize: { type: Number, required: true, min: 1 }, sha256: { type: String, required: true, minlength: 64, maxlength: 64 } }, { _id: false, strict: 'throw' });
const patientSnapshotSchema = new Schema({ id: String, fullName: String, birthDate: { type: String, default: null }, referenceNumber: { type: String, default: null } }, { _id: false, strict: 'throw' });
const guardianSnapshotSchema = new Schema({ id: String, fullName: String, relationship: String }, { _id: false, strict: 'throw' });
const treatmentSnapshotSchema = new Schema({ id: String, label: String, status: String, startDate: { type: String, default: null }, completedAt: { type: String, default: null } }, { _id: false, strict: 'throw' });
const retentionSnapshotSchema = new Schema({ id: String, status: String, startedAt: { type: String, default: null }, nextControlAt: { type: String, default: null } }, { _id: false, strict: 'throw' });
const appointmentSnapshotSchema = new Schema({ id: String, scheduledAt: String, status: String, typeLabel: String }, { _id: false, strict: 'throw' });
const financeSnapshotSchema = new Schema({ from: String, to: String, totalRecordedMinor: Number, currency: String, recordCount: Number }, { _id: false, strict: 'throw' });
const contextSchema = new Schema({ patient: { type: patientSnapshotSchema, required: true }, guardian: { type: guardianSnapshotSchema, default: null }, treatment: { type: treatmentSnapshotSchema, default: null }, retention: { type: retentionSnapshotSchema, default: null }, appointment: { type: appointmentSnapshotSchema, default: null }, finance: { type: financeSnapshotSchema, default: null } }, { _id: false, strict: 'throw' });

const documentSchema = new Schema<GeneratedDocumentAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    patientId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    documentRef: { type: String, required: true, immutable: true, maxlength: 32 },
    templateId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    templateCode: { type: String, required: true, immutable: true },
    templateVersion: { type: Number, required: true, immutable: true },
    category: { type: String, enum: DOCUMENT_CATEGORY_VALUES, required: true, immutable: true },
    titleSnapshot: { type: String, required: true, immutable: true },
    contentSnapshot: { type: [blockSchema], required: true, immutable: true },
    contextSnapshot: { type: contextSchema, required: true, immutable: true },
    generatedByUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    generatedByNameSnapshot: { type: String, required: true, immutable: true },
    generatedAt: { type: Date, required: true, immutable: true },
    retentionExpiresAt: { type: Date, required: true, index: true },
    finalizedPdf: { type: artifactSchema, default: null },
    idempotencyKey: { type: String, required: true, immutable: true, maxlength: 64 },
    payloadDigest: { type: String, required: true, immutable: true, minlength: 64, maxlength: 64 },
    status: { type: String, enum: GENERATED_DOCUMENT_STATUS_VALUES, default: GENERATED_DOCUMENT_STATUSES.FINALIZED, required: true },
    voidedAt: { type: Date, default: null },
    voidedByUserId: { type: Schema.Types.ObjectId, default: null },
    voidReason: { type: String, default: null, maxlength: 500 },
    deletedAt: { type: Date, default: null },
    deletionReason: { type: String, default: null, maxlength: 500 },
  },
  { collection: 'generatedDocuments', timestamps: { createdAt: true, updatedAt: false }, strict: 'throw', versionKey: false },
);
documentSchema.index({ clinicId: 1, patientId: 1, generatedAt: -1 });
documentSchema.index({ clinicId: 1, documentRef: 1 }, { unique: true });
documentSchema.index({ clinicId: 1, idempotencyKey: 1 }, { unique: true });
documentSchema.index({ clinicId: 1, templateId: 1, templateVersion: 1 });
documentSchema.index({ clinicId: 1, status: 1, retentionExpiresAt: 1 });

export const DocumentTemplateModel = model<DocumentTemplateAttributes>('DocumentTemplate', templateSchema);
export const GeneratedDocumentModel = model<GeneratedDocumentAttributes>('GeneratedDocument', documentSchema);

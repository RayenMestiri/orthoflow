import type { ClientSession, QueryFilter } from 'mongoose';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { nextSequenceValue } from '../../infrastructure/database/counter.model.js';
import { DocumentTemplateModel, GeneratedDocumentModel } from './generated-document.model.js';
import {
  DOCUMENT_TEMPLATE_STATUSES,
  GENERATED_DOCUMENT_STATUSES,
  type CreateDocumentTemplateInput,
  type DocumentCategory,
  type DocumentTemplateRecord,
  type DocumentTemplateStatus,
  type GeneratedDocumentRecord,
  type UpdateDocumentTemplateInput,
} from './generated-document.types.js';

export interface DocumentTemplateListFilters {
  status?: DocumentTemplateStatus;
  category?: DocumentCategory;
  code?: string;
}

export class DocumentTemplateRepository {
  private baseFilter(clinicId: string): QueryFilter<DocumentTemplateRecord> {
    return { clinicId: toObjectId(clinicId, 'clinicId') };
  }

  async list(clinicId: string, filters: DocumentTemplateListFilters, pagination: PaginationParams): Promise<PaginatedResult<DocumentTemplateRecord>> {
    const query = { ...this.baseFilter(clinicId), ...(filters.status ? { status: filters.status } : {}), ...(filters.category ? { category: filters.category } : {}), ...(filters.code ? { code: filters.code.toUpperCase() } : {}) };
    const [items, total] = await Promise.all([
      DocumentTemplateModel.find(query).sort({ code: 1, version: -1 }).skip(pagination.skip).limit(pagination.limit).lean<DocumentTemplateRecord[]>().exec(),
      DocumentTemplateModel.countDocuments(query).exec(),
    ]);
    return { items, total };
  }

  async findByIdInClinic(id: string, clinicId: string): Promise<DocumentTemplateRecord | null> {
    return DocumentTemplateModel.findOne({ ...this.baseFilter(clinicId), _id: toObjectId(id, 'templateId') }).lean<DocumentTemplateRecord | null>().exec();
  }

  async findLatestByCode(code: string, clinicId: string): Promise<DocumentTemplateRecord | null> {
    return DocumentTemplateModel.findOne({ ...this.baseFilter(clinicId), code: code.toUpperCase() }).sort({ version: -1 }).lean<DocumentTemplateRecord | null>().exec();
  }

  async create(clinicId: string, input: CreateDocumentTemplateInput, version: number, variablesUsed: string[], actorUserId: string, session?: ClientSession): Promise<DocumentTemplateRecord> {
    const [created] = await DocumentTemplateModel.create([{ clinicId: toObjectId(clinicId, 'clinicId'), code: input.code.toUpperCase(), version, title: input.title, category: input.category, definition: input.definition, variablesUsed, status: DOCUMENT_TEMPLATE_STATUSES.DRAFT, createdByUserId: toObjectId(actorUserId, 'actorUserId'), updatedByUserId: toObjectId(actorUserId, 'actorUserId'), activatedAt: null, archivedAt: null }], { session, ordered: true });
    if (!created) throw new Error('Document template creation returned no document');
    return created.toObject<DocumentTemplateRecord>();
  }

  async updateDraft(id: string, clinicId: string, changes: UpdateDocumentTemplateInput & { variablesUsed?: string[] }, actorUserId: string): Promise<DocumentTemplateRecord | null> {
    return DocumentTemplateModel.findOneAndUpdate({ ...this.baseFilter(clinicId), _id: toObjectId(id, 'templateId'), status: DOCUMENT_TEMPLATE_STATUSES.DRAFT }, { $set: { ...changes, updatedByUserId: toObjectId(actorUserId, 'actorUserId') } }, { new: true, runValidators: true }).lean<DocumentTemplateRecord | null>().exec();
  }

  async activate(template: DocumentTemplateRecord, actorUserId: string, at: Date, session?: ClientSession): Promise<DocumentTemplateRecord | null> {
    const archive = DocumentTemplateModel.updateMany({ ...this.baseFilter(template.clinicId.toString()), code: template.code, status: DOCUMENT_TEMPLATE_STATUSES.ACTIVE }, { $set: { status: DOCUMENT_TEMPLATE_STATUSES.ARCHIVED, archivedAt: at, updatedByUserId: toObjectId(actorUserId, 'actorUserId') } });
    if (session) archive.session(session);
    await archive.exec();
    const activate = DocumentTemplateModel.findOneAndUpdate({ ...this.baseFilter(template.clinicId.toString()), _id: template._id, status: DOCUMENT_TEMPLATE_STATUSES.DRAFT }, { $set: { status: DOCUMENT_TEMPLATE_STATUSES.ACTIVE, activatedAt: at, archivedAt: null, updatedByUserId: toObjectId(actorUserId, 'actorUserId') } }, { new: true, runValidators: true });
    if (session) activate.session(session);
    return activate.lean<DocumentTemplateRecord | null>().exec();
  }

  async archive(id: string, clinicId: string, actorUserId: string, at: Date): Promise<DocumentTemplateRecord | null> {
    return DocumentTemplateModel.findOneAndUpdate({ ...this.baseFilter(clinicId), _id: toObjectId(id, 'templateId'), status: { $ne: DOCUMENT_TEMPLATE_STATUSES.ARCHIVED } }, { $set: { status: DOCUMENT_TEMPLATE_STATUSES.ARCHIVED, archivedAt: at, updatedByUserId: toObjectId(actorUserId, 'actorUserId') } }, { new: true, runValidators: true }).lean<DocumentTemplateRecord | null>().exec();
  }

  async seedDefaults(clinicId: string, templates: Array<CreateDocumentTemplateInput & { variablesUsed: string[] }>): Promise<DocumentTemplateRecord[]> {
    const cId = toObjectId(clinicId, 'clinicId');
    const now = new Date();
    const records = templates.map((tpl) => ({
      clinicId: cId,
      code: tpl.code.toUpperCase(),
      version: 1,
      title: tpl.title,
      category: tpl.category,
      definition: tpl.definition,
      variablesUsed: tpl.variablesUsed,
      status: DOCUMENT_TEMPLATE_STATUSES.ACTIVE,
      createdByUserId: cId,
      updatedByUserId: cId,
      activatedAt: now,
      archivedAt: null,
    }));
    const created = await DocumentTemplateModel.insertMany(records, { ordered: false });
    return created.map((doc) => doc.toObject<DocumentTemplateRecord>());
  }
}

export type CreateGeneratedDocumentRecordInput = Omit<GeneratedDocumentRecord, '_id' | 'createdAt' | 'clinicId' | 'patientId' | 'templateId' | 'generatedByUserId' | 'voidedByUserId'> & { clinicId: string; patientId: string; templateId: string; generatedByUserId: string };

export class GeneratedDocumentRepository {
  private baseFilter(clinicId: string): QueryFilter<GeneratedDocumentRecord> { return { clinicId: toObjectId(clinicId, 'clinicId') }; }

  async listByPatient(clinicId: string, patientId: string, pagination: PaginationParams): Promise<PaginatedResult<GeneratedDocumentRecord>> {
    const query = { ...this.baseFilter(clinicId), patientId: toObjectId(patientId, 'patientId') };
    const [items, total] = await Promise.all([
      GeneratedDocumentModel.find(query).sort({ generatedAt: -1, _id: -1 }).skip(pagination.skip).limit(pagination.limit).lean<GeneratedDocumentRecord[]>().exec(),
      GeneratedDocumentModel.countDocuments(query).exec(),
    ]);
    return { items, total };
  }

  async findByIdInClinic(id: string, clinicId: string): Promise<GeneratedDocumentRecord | null> { return GeneratedDocumentModel.findOne({ ...this.baseFilter(clinicId), _id: toObjectId(id, 'documentId') }).lean<GeneratedDocumentRecord | null>().exec(); }
  async findByIdempotencyKey(key: string, clinicId: string): Promise<GeneratedDocumentRecord | null> { return GeneratedDocumentModel.findOne({ ...this.baseFilter(clinicId), idempotencyKey: key }).lean<GeneratedDocumentRecord | null>().exec(); }

  async reserveReference(clinicId: string, year: number): Promise<string> {
    const sequence = await nextSequenceValue(`generated-document:${clinicId}:${year}`);
    return `DOC-${year}-${String(sequence).padStart(6, '0')}`;
  }

  async create(input: CreateGeneratedDocumentRecordInput, session?: ClientSession): Promise<GeneratedDocumentRecord> {
    const [created] = await GeneratedDocumentModel.create([{ ...input, clinicId: toObjectId(input.clinicId, 'clinicId'), patientId: toObjectId(input.patientId, 'patientId'), templateId: toObjectId(input.templateId, 'templateId'), generatedByUserId: toObjectId(input.generatedByUserId, 'generatedByUserId'), voidedByUserId: null }], { session, ordered: true });
    if (!created) throw new Error('Generated document creation returned no document');
    return created.toObject<GeneratedDocumentRecord>();
  }

  async void(id: string, clinicId: string, actorUserId: string, reason: string, at: Date, session?: ClientSession): Promise<GeneratedDocumentRecord | null> {
    const query = GeneratedDocumentModel.findOneAndUpdate({ ...this.baseFilter(clinicId), _id: toObjectId(id, 'documentId'), status: GENERATED_DOCUMENT_STATUSES.FINALIZED }, { $set: { status: GENERATED_DOCUMENT_STATUSES.VOIDED, voidedAt: at, voidedByUserId: toObjectId(actorUserId, 'actorUserId'), voidReason: reason } }, { new: true, runValidators: true });
    if (session) query.session(session);
    return query.lean<GeneratedDocumentRecord | null>().exec();
  }

  async findExpiredCandidates(limit: number, now: Date = new Date()): Promise<GeneratedDocumentRecord[]> {
    return GeneratedDocumentModel.find({
      status: GENERATED_DOCUMENT_STATUSES.FINALIZED,
      retentionExpiresAt: { $lte: now },
      finalizedPdf: { $ne: null },
    })
      .limit(limit)
      .lean<GeneratedDocumentRecord[]>()
      .exec();
  }

  async markExpiredAndRemoveBinary(
    id: string,
    clinicId: string,
    deletedAt: Date = new Date(),
    deletionReason = 'AUTOMATIC_30_DAY_EXPIRATION',
  ): Promise<GeneratedDocumentRecord | null> {
    return GeneratedDocumentModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(id, 'documentId'),
        status: GENERATED_DOCUMENT_STATUSES.FINALIZED,
      },
      {
        $set: {
          status: GENERATED_DOCUMENT_STATUSES.EXPIRED,
          deletedAt,
          deletionReason,
          finalizedPdf: null,
        },
      },
      { new: true, runValidators: true },
    )
      .lean<GeneratedDocumentRecord | null>()
      .exec();
  }
}

export const documentTemplateRepository = new DocumentTemplateRepository();
export const generatedDocumentRepository = new GeneratedDocumentRepository();

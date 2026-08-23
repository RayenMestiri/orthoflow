import type { ClientSession, QueryFilter } from 'mongoose';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { nextSequenceValue } from '../../infrastructure/database/counter.model.js';
import { ConsentTemplateModel, SignedConsentModel } from './consent.model.js';
import {
  CONSENT_TEMPLATE_STATUSES,
  SIGNED_CONSENT_STATUSES,
  type ConsentCategory,
  type ConsentTemplateRecord,
  type ConsentTemplateStatus,
  type CreateConsentTemplateInput,
  type SignedConsentRecord,
  type UpdateConsentTemplateInput,
} from './consent.types.js';

export interface ConsentTemplateListFilters {
  status?: ConsentTemplateStatus;
  category?: ConsentCategory;
  code?: string;
}

export class ConsentTemplateRepository {
  private baseFilter(clinicId: string): QueryFilter<ConsentTemplateRecord> {
    return { clinicId: toObjectId(clinicId, 'clinicId') };
  }

  async list(
    clinicId: string,
    filters: ConsentTemplateListFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ConsentTemplateRecord>> {
    const query = {
      ...this.baseFilter(clinicId),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.code ? { code: filters.code.toUpperCase() } : {}),
    };
    const [items, total] = await Promise.all([
      ConsentTemplateModel.find(query)
        .sort({ code: 1, version: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<ConsentTemplateRecord[]>()
        .exec(),
      ConsentTemplateModel.countDocuments(query).exec(),
    ]);
    return { items, total };
  }

  async findByIdInClinic(templateId: string, clinicId: string): Promise<ConsentTemplateRecord | null> {
    return ConsentTemplateModel.findOne({
      ...this.baseFilter(clinicId),
      _id: toObjectId(templateId, 'templateId'),
    })
      .lean<ConsentTemplateRecord | null>()
      .exec();
  }

  async findLatestByCode(code: string, clinicId: string): Promise<ConsentTemplateRecord | null> {
    return ConsentTemplateModel.findOne({ ...this.baseFilter(clinicId), code: code.toUpperCase() })
      .sort({ version: -1 })
      .lean<ConsentTemplateRecord | null>()
      .exec();
  }

  async create(
    clinicId: string,
    input: CreateConsentTemplateInput,
    version: number,
    actorUserId: string,
    session?: ClientSession,
  ): Promise<ConsentTemplateRecord> {
    const [created] = await ConsentTemplateModel.create(
      [
        {
          clinicId: toObjectId(clinicId, 'clinicId'),
          code: input.code.toUpperCase(),
          version,
          title: input.title,
          category: input.category,
          content: input.content,
          status: CONSENT_TEMPLATE_STATUSES.DRAFT,
          createdByUserId: toObjectId(actorUserId, 'actorUserId'),
          updatedByUserId: toObjectId(actorUserId, 'actorUserId'),
          activatedAt: null,
          archivedAt: null,
        },
      ],
      { session, ordered: true },
    );
    if (!created) throw new Error('Consent template creation returned no document');
    return created.toObject<ConsentTemplateRecord>();
  }

  async updateDraft(
    templateId: string,
    clinicId: string,
    changes: UpdateConsentTemplateInput,
    actorUserId: string,
  ): Promise<ConsentTemplateRecord | null> {
    return ConsentTemplateModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(templateId, 'templateId'),
        status: CONSENT_TEMPLATE_STATUSES.DRAFT,
      },
      { $set: { ...changes, updatedByUserId: toObjectId(actorUserId, 'actorUserId') } },
      { new: true, runValidators: true },
    )
      .lean<ConsentTemplateRecord | null>()
      .exec();
  }

  async activate(
    template: ConsentTemplateRecord,
    actorUserId: string,
    activatedAt: Date,
    session?: ClientSession,
  ): Promise<ConsentTemplateRecord | null> {
    const archiveQuery = ConsentTemplateModel.updateMany(
      {
        ...this.baseFilter(template.clinicId.toString()),
        code: template.code,
        status: CONSENT_TEMPLATE_STATUSES.ACTIVE,
      },
      {
        $set: {
          status: CONSENT_TEMPLATE_STATUSES.ARCHIVED,
          archivedAt: activatedAt,
          updatedByUserId: toObjectId(actorUserId, 'actorUserId'),
        },
      },
    );
    if (session) archiveQuery.session(session);
    await archiveQuery.exec();

    const activateQuery = ConsentTemplateModel.findOneAndUpdate(
      {
        ...this.baseFilter(template.clinicId.toString()),
        _id: template._id,
        status: CONSENT_TEMPLATE_STATUSES.DRAFT,
      },
      {
        $set: {
          status: CONSENT_TEMPLATE_STATUSES.ACTIVE,
          activatedAt,
          archivedAt: null,
          updatedByUserId: toObjectId(actorUserId, 'actorUserId'),
        },
      },
      { new: true, runValidators: true },
    );
    if (session) activateQuery.session(session);
    return activateQuery.lean<ConsentTemplateRecord | null>().exec();
  }

  async archive(
    templateId: string,
    clinicId: string,
    actorUserId: string,
    at: Date,
  ): Promise<ConsentTemplateRecord | null> {
    return ConsentTemplateModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(templateId, 'templateId'),
        status: { $ne: CONSENT_TEMPLATE_STATUSES.ARCHIVED },
      },
      {
        $set: {
          status: CONSENT_TEMPLATE_STATUSES.ARCHIVED,
          archivedAt: at,
          updatedByUserId: toObjectId(actorUserId, 'actorUserId'),
        },
      },
      { new: true, runValidators: true },
    )
      .lean<ConsentTemplateRecord | null>()
      .exec();
  }
}

export type CreateSignedConsentRecordInput = Omit<
  SignedConsentRecord,
  '_id' | 'createdAt' | 'clinicId' | 'patientId' | 'templateId' | 'guardianId' | 'treatmentId' | 'retentionPlanId' | 'presentedByUserId' | 'revokedByUserId' | 'voidedByUserId'
> & {
  clinicId: string;
  patientId: string;
  templateId: string;
  guardianId: string | null;
  treatmentId: string | null;
  retentionPlanId: string | null;
  presentedByUserId: string;
};

export class SignedConsentRepository {
  private baseFilter(clinicId: string): QueryFilter<SignedConsentRecord> {
    return { clinicId: toObjectId(clinicId, 'clinicId') };
  }

  async listByPatient(
    clinicId: string,
    patientId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<SignedConsentRecord>> {
    const query = {
      ...this.baseFilter(clinicId),
      patientId: toObjectId(patientId, 'patientId'),
    };
    const [items, total] = await Promise.all([
      SignedConsentModel.find(query)
        .sort({ signedAt: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<SignedConsentRecord[]>()
        .exec(),
      SignedConsentModel.countDocuments(query).exec(),
    ]);
    return { items, total };
  }

  async findByIdInClinic(consentId: string, clinicId: string): Promise<SignedConsentRecord | null> {
    return SignedConsentModel.findOne({
      ...this.baseFilter(clinicId),
      _id: toObjectId(consentId, 'consentId'),
    })
      .lean<SignedConsentRecord | null>()
      .exec();
  }

  async findByIdempotencyKey(key: string, clinicId: string): Promise<SignedConsentRecord | null> {
    return SignedConsentModel.findOne({ ...this.baseFilter(clinicId), idempotencyKey: key })
      .lean<SignedConsentRecord | null>()
      .exec();
  }

  async reserveConsentReference(clinicId: string, year: number): Promise<string> {
    const sequence = await nextSequenceValue(`consent:${clinicId}:${year}`);
    return `CNS-${year}-${String(sequence).padStart(6, '0')}`;
  }

  async create(input: CreateSignedConsentRecordInput, session?: ClientSession): Promise<SignedConsentRecord> {
    const [created] = await SignedConsentModel.create(
      [
        {
          ...input,
          clinicId: toObjectId(input.clinicId, 'clinicId'),
          patientId: toObjectId(input.patientId, 'patientId'),
          templateId: toObjectId(input.templateId, 'templateId'),
          guardianId: input.guardianId ? toObjectId(input.guardianId, 'guardianId') : null,
          treatmentId: input.treatmentId ? toObjectId(input.treatmentId, 'treatmentId') : null,
          retentionPlanId: input.retentionPlanId
            ? toObjectId(input.retentionPlanId, 'retentionPlanId')
            : null,
          presentedByUserId: toObjectId(input.presentedByUserId, 'presentedByUserId'),
          revokedByUserId: null,
          voidedByUserId: null,
        },
      ],
      { session, ordered: true },
    );
    if (!created) throw new Error('Signed consent creation returned no document');
    return created.toObject<SignedConsentRecord>();
  }

  async revoke(
    consentId: string,
    clinicId: string,
    actorUserId: string,
    reason: string,
    at: Date,
    session?: ClientSession,
  ): Promise<SignedConsentRecord | null> {
    const query = SignedConsentModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(consentId, 'consentId'),
        status: SIGNED_CONSENT_STATUSES.SIGNED,
      },
      {
        $set: {
          status: SIGNED_CONSENT_STATUSES.REVOKED,
          revokedAt: at,
          revokedByUserId: toObjectId(actorUserId, 'actorUserId'),
          revocationReason: reason,
        },
      },
      { new: true, runValidators: true },
    );
    if (session) query.session(session);
    return query.lean<SignedConsentRecord | null>().exec();
  }

  async void(
    consentId: string,
    clinicId: string,
    actorUserId: string,
    reason: string,
    at: Date,
    session?: ClientSession,
  ): Promise<SignedConsentRecord | null> {
    const query = SignedConsentModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(consentId, 'consentId'),
        status: { $in: [SIGNED_CONSENT_STATUSES.SIGNED, SIGNED_CONSENT_STATUSES.REVOKED] },
      },
      {
        $set: {
          status: SIGNED_CONSENT_STATUSES.VOIDED,
          voidedAt: at,
          voidedByUserId: toObjectId(actorUserId, 'actorUserId'),
          voidReason: reason,
        },
      },
      { new: true, runValidators: true },
    );
    if (session) query.session(session);
    return query.lean<SignedConsentRecord | null>().exec();
  }
}

export const consentTemplateRepository = new ConsentTemplateRepository();
export const signedConsentRepository = new SignedConsentRepository();

import type { QueryFilter } from 'mongoose';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { TreatmentMilestoneModel, TreatmentModel } from './treatment.model.js';
import {
  TREATMENT_STATUSES,
  type CreateTreatmentInput,
  type CreateTreatmentMilestoneInput,
  type TreatmentAttributes,
  type TreatmentMilestoneAttributes,
  type TreatmentMilestoneRecord,
  type TreatmentRecord,
  type TreatmentStatus,
  type TreatmentStatusChangeFields,
  type UpdateTreatmentFields,
  type UpdateTreatmentMilestoneFields,
} from './treatment.types.js';

export class TreatmentRepository {
  private baseFilter(clinicId: string): QueryFilter<TreatmentAttributes> {
    return { clinicId: toObjectId(clinicId, 'clinicId') };
  }

  async findByIdInClinic(treatmentId: string, clinicId: string): Promise<TreatmentRecord | null> {
    return TreatmentModel.findOne({
      ...this.baseFilter(clinicId),
      _id: toObjectId(treatmentId, 'treatmentId'),
    })
      .lean<TreatmentRecord | null>()
      .exec();
  }

  async findManyByIdsInClinic(
    treatmentIds: string[],
    clinicId: string,
  ): Promise<TreatmentRecord[]> {
    if (treatmentIds.length === 0) return [];
    return TreatmentModel.find({
      ...this.baseFilter(clinicId),
      _id: { $in: treatmentIds.map((id) => toObjectId(id, 'treatmentId')) },
    })
      .limit(treatmentIds.length)
      .lean<TreatmentRecord[]>()
      .exec();
  }

  async listByPatient(
    patientId: string,
    clinicId: string,
    filters: { status?: TreatmentStatus } = {},
  ): Promise<TreatmentRecord[]> {
    const filter: QueryFilter<TreatmentAttributes> = {
      ...this.baseFilter(clinicId),
      patientId: toObjectId(patientId, 'patientId'),
    };
    if (filters.status !== undefined) filter.status = filters.status;
    return TreatmentModel.find(filter).sort({ createdAt: -1 }).lean<TreatmentRecord[]>().exec();
  }

  async findActiveForPatient(patientId: string, clinicId: string): Promise<TreatmentRecord | null> {
    return TreatmentModel.findOne({
      ...this.baseFilter(clinicId),
      patientId: toObjectId(patientId, 'patientId'),
      status: TREATMENT_STATUSES.ACTIVE,
    })
      .lean<TreatmentRecord | null>()
      .exec();
  }

  async create(input: CreateTreatmentInput): Promise<TreatmentRecord> {
    const [created] = await TreatmentModel.create([
      {
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        patientId: toObjectId(input.patientId, 'patientId'),
        doctorId: toObjectId(input.doctorId, 'doctorId'),
        type: input.type,
        customTypeLabel: input.customTypeLabel ?? null,
        status: input.status ?? TREATMENT_STATUSES.PLANNED,
        startDate: input.startDate ?? null,
        expectedEndDate: input.expectedEndDate ?? null,
        completedAt: null,
        completionDate: null,
        debondPerformed: null,
        debondDate: null,
        retentionRequired: null,
        finalMediaIds: [],
        agreedPrice: input.agreedPrice ?? null,
        notes: input.notes ?? null,
        cancellationReason: null,
        createdBy: toObjectId(input.createdBy, 'createdBy'),
        updatedBy: null,
      },
    ]);
    if (!created) throw new Error('Treatment creation returned no document');
    return created.toObject<TreatmentRecord>();
  }

  async update(
    treatmentId: string,
    clinicId: string,
    changes: UpdateTreatmentFields,
  ): Promise<TreatmentRecord | null> {
    const set: Record<string, unknown> = { updatedBy: toObjectId(changes.updatedBy, 'updatedBy') };
    if (changes.type !== undefined) set.type = changes.type;
    if (changes.customTypeLabel !== undefined) set.customTypeLabel = changes.customTypeLabel;
    if (changes.expectedEndDate !== undefined) set.expectedEndDate = changes.expectedEndDate;
    if (changes.agreedPrice !== undefined) set.agreedPrice = changes.agreedPrice;
    if (changes.notes !== undefined) set.notes = changes.notes;
    return TreatmentModel.findOneAndUpdate(
      { ...this.baseFilter(clinicId), _id: toObjectId(treatmentId, 'treatmentId') },
      { $set: set },
      { new: true, runValidators: true },
    )
      .lean<TreatmentRecord | null>()
      .exec();
  }

  async changeStatus(
    treatmentId: string,
    clinicId: string,
    expectedFrom: TreatmentStatus,
    changes: TreatmentStatusChangeFields,
  ): Promise<TreatmentRecord | null> {
    const set: Record<string, unknown> = {
      status: changes.status,
      updatedBy: toObjectId(changes.updatedBy, 'updatedBy'),
    };
    if (changes.startDate !== undefined) set.startDate = changes.startDate;
    if (changes.completedAt !== undefined) set.completedAt = changes.completedAt;
    if (changes.completionDate !== undefined) set.completionDate = changes.completionDate;
    if (changes.debondPerformed !== undefined) set.debondPerformed = changes.debondPerformed;
    if (changes.debondDate !== undefined) set.debondDate = changes.debondDate;
    if (changes.retentionRequired !== undefined) set.retentionRequired = changes.retentionRequired;
    if (changes.finalMediaIds !== undefined) {
      set.finalMediaIds = changes.finalMediaIds.map((id) => toObjectId(id, 'finalMediaId'));
    }
    if (changes.cancellationReason !== undefined)
      set.cancellationReason = changes.cancellationReason;
    return TreatmentModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(treatmentId, 'treatmentId'),
        status: expectedFrom,
      },
      { $set: set },
      { new: true, runValidators: true },
    )
      .lean<TreatmentRecord | null>()
      .exec();
  }

  async markRetentionRequired(
    treatmentId: string,
    clinicId: string,
    updatedBy: string,
  ): Promise<TreatmentRecord | null> {
    return TreatmentModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(treatmentId, 'treatmentId'),
        status: TREATMENT_STATUSES.COMPLETED,
      },
      {
        $set: {
          retentionRequired: true,
          updatedBy: toObjectId(updatedBy, 'updatedBy'),
        },
      },
      { new: true, runValidators: true },
    )
      .lean<TreatmentRecord | null>()
      .exec();
  }

  async createMilestone(input: CreateTreatmentMilestoneInput): Promise<TreatmentMilestoneRecord> {
    const [created] = await TreatmentMilestoneModel.create([
      {
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        patientId: toObjectId(input.patientId, 'patientId'),
        treatmentId: toObjectId(input.treatmentId, 'treatmentId'),
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        occurredAt: input.occurredAt,
        createdBy: toObjectId(input.createdBy, 'createdBy'),
        updatedBy: null,
      },
    ]);
    if (!created) throw new Error('Treatment milestone creation returned no document');
    return created.toObject<TreatmentMilestoneRecord>();
  }

  async findMilestoneInTreatment(
    milestoneId: string,
    treatmentId: string,
    clinicId: string,
  ): Promise<TreatmentMilestoneRecord | null> {
    return TreatmentMilestoneModel.findOne({
      clinicId: toObjectId(clinicId, 'clinicId'),
      treatmentId: toObjectId(treatmentId, 'treatmentId'),
      _id: toObjectId(milestoneId, 'milestoneId'),
    })
      .lean<TreatmentMilestoneRecord | null>()
      .exec();
  }

  async updateMilestone(
    milestoneId: string,
    treatmentId: string,
    clinicId: string,
    changes: UpdateTreatmentMilestoneFields,
  ): Promise<TreatmentMilestoneRecord | null> {
    const set: Record<string, unknown> = { updatedBy: toObjectId(changes.updatedBy, 'updatedBy') };
    if (changes.title !== undefined) set.title = changes.title;
    if (changes.description !== undefined) set.description = changes.description;
    if (changes.occurredAt !== undefined) set.occurredAt = changes.occurredAt;
    return TreatmentMilestoneModel.findOneAndUpdate(
      {
        clinicId: toObjectId(clinicId, 'clinicId'),
        treatmentId: toObjectId(treatmentId, 'treatmentId'),
        _id: toObjectId(milestoneId, 'milestoneId'),
      },
      { $set: set },
      { new: true, runValidators: true },
    )
      .lean<TreatmentMilestoneRecord | null>()
      .exec();
  }

  async listMilestonesByTreatment(
    treatmentId: string,
    clinicId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<TreatmentMilestoneRecord>> {
    const filter: QueryFilter<TreatmentMilestoneAttributes> = {
      clinicId: toObjectId(clinicId, 'clinicId'),
      treatmentId: toObjectId(treatmentId, 'treatmentId'),
    };
    const [items, total] = await Promise.all([
      TreatmentMilestoneModel.find(filter)
        .sort({ occurredAt: -1, createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<TreatmentMilestoneRecord[]>()
        .exec(),
      TreatmentMilestoneModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async listMilestonesByTreatmentIds(
    treatmentIds: string[],
    clinicId: string,
  ): Promise<TreatmentMilestoneRecord[]> {
    if (treatmentIds.length === 0) return [];
    return TreatmentMilestoneModel.find({
      clinicId: toObjectId(clinicId, 'clinicId'),
      treatmentId: { $in: treatmentIds.map((id) => toObjectId(id, 'treatmentId')) },
    })
      .sort({ occurredAt: -1, createdAt: -1 })
      .lean<TreatmentMilestoneRecord[]>()
      .exec();
  }
}

export const treatmentRepository = new TreatmentRepository();

import type { ClientSession, QueryFilter } from 'mongoose';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { ClinicalVisitModel } from './clinical-visit.model.js';
import {
  CLINICAL_VISIT_STATUSES,
  type ClinicalVisitAttributes,
  type ClinicalVisitRecord,
  type ClinicalVisitWriteFields,
} from './clinical-visit.types.js';

export class ClinicalVisitRepository {
  private baseFilter(clinicId: string): QueryFilter<ClinicalVisitAttributes> {
    return { clinicId: toObjectId(clinicId, 'clinicId') };
  }

  async findByIdInClinic(id: string, clinicId: string): Promise<ClinicalVisitRecord | null> {
    return ClinicalVisitModel.findOne({ ...this.baseFilter(clinicId), _id: toObjectId(id, 'visitId') })
      .lean<ClinicalVisitRecord | null>()
      .exec();
  }

  async findByAppointment(
    appointmentId: string,
    clinicId: string,
  ): Promise<ClinicalVisitRecord | null> {
    return ClinicalVisitModel.findOne({
      ...this.baseFilter(clinicId),
      appointmentId: toObjectId(appointmentId, 'appointmentId'),
    })
      .lean<ClinicalVisitRecord | null>()
      .exec();
  }

  async findPreviousCompleted(
    patientId: string,
    clinicId: string,
    before: Date,
    excludeId: string,
  ): Promise<ClinicalVisitRecord | null> {
    return ClinicalVisitModel.findOne({
      ...this.baseFilter(clinicId),
      patientId: toObjectId(patientId, 'patientId'),
      _id: { $ne: toObjectId(excludeId, 'visitId') },
      status: CLINICAL_VISIT_STATUSES.COMPLETED,
      startedAt: { $lt: before },
    })
      .sort({ startedAt: -1 })
      .lean<ClinicalVisitRecord | null>()
      .exec();
  }

  async listByPatient(
    patientId: string,
    clinicId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ClinicalVisitRecord>> {
    const filter = {
      ...this.baseFilter(clinicId),
      patientId: toObjectId(patientId, 'patientId'),
    };
    const [items, total] = await Promise.all([
      ClinicalVisitModel.find(filter)
        .sort({ startedAt: -1, createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<ClinicalVisitRecord[]>()
        .exec(),
      ClinicalVisitModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async create(input: {
    clinicId: string;
    patientId: string;
    appointmentId: string;
    treatmentId: string | null;
    retentionPlanId: string | null;
    startedAt: Date;
    createdBy: string;
  }): Promise<ClinicalVisitRecord> {
    const [created] = await ClinicalVisitModel.create([
      {
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        patientId: toObjectId(input.patientId, 'patientId'),
        appointmentId: toObjectId(input.appointmentId, 'appointmentId'),
        treatmentId:
          input.treatmentId === null ? null : toObjectId(input.treatmentId, 'treatmentId'),
        retentionPlanId:
          input.retentionPlanId === null
            ? null
            : toObjectId(input.retentionPlanId, 'retentionPlanId'),
        startedAt: input.startedAt,
        createdBy: toObjectId(input.createdBy, 'createdBy'),
      },
    ]);
    if (!created) throw new Error('Clinical visit creation returned no document');
    return created.toObject<ClinicalVisitRecord>();
  }

  async update(
    id: string,
    clinicId: string,
    changes: ClinicalVisitWriteFields,
    updatedBy: string,
    session?: ClientSession,
  ): Promise<ClinicalVisitRecord | null> {
    const set: Record<string, unknown> = { updatedBy: toObjectId(updatedBy, 'updatedBy') };
    for (const [key, value] of Object.entries(changes)) {
      set[key] =
        (key === 'treatmentId' || key === 'retentionPlanId') && typeof value === 'string'
          ? toObjectId(value, key)
          : value;
    }
    return ClinicalVisitModel.findOneAndUpdate(
      { ...this.baseFilter(clinicId), _id: toObjectId(id, 'visitId') },
      { $set: set },
      { new: true, runValidators: true, session },
    )
      .lean<ClinicalVisitRecord | null>()
      .exec();
  }

  async complete(
    id: string,
    clinicId: string,
    updatedBy: string,
    completedAt: Date,
    session?: ClientSession,
  ): Promise<ClinicalVisitRecord | null> {
    return ClinicalVisitModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(id, 'visitId'),
        status: CLINICAL_VISIT_STATUSES.DRAFT,
      },
      {
        $set: {
          status: CLINICAL_VISIT_STATUSES.COMPLETED,
          completedAt,
          updatedBy: toObjectId(updatedBy, 'updatedBy'),
        },
      },
      { new: true, runValidators: true, session },
    )
      .lean<ClinicalVisitRecord | null>()
      .exec();
  }
}

export const clinicalVisitRepository = new ClinicalVisitRepository();

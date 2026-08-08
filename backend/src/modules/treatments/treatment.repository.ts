import type { QueryFilter } from 'mongoose';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { TreatmentModel, TreatmentProgressModel } from './treatment.model.js';
import {
  OCCUPYING_TREATMENT_STATUSES,
  TREATMENT_STATUSES,
  type CreateTreatmentInput,
  type CreateTreatmentProgressInput,
  type TreatmentAttributes,
  type TreatmentProgressAttributes,
  type TreatmentProgressRecord,
  type TreatmentRecord,
  type TreatmentStatus,
  type TreatmentStatusChangeFields,
  type UpdateTreatmentFields,
} from './treatment.types.js';

/**
 * Persistence for treatments and their progress timeline.
 *
 * TENANCY RULE, same as patients: `clinicId` is a required parameter of every
 * method and always lands in the filter. There is deliberately no
 * `findById(treatmentId)` — a method without a tenant is a cross-tenant read
 * waiting to be called from the wrong place.
 */
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

  /** A patient's whole care history, newest first. */
  async listByPatient(
    patientId: string,
    clinicId: string,
    filters: { status?: TreatmentStatus } = {},
  ): Promise<TreatmentRecord[]> {
    const filter: QueryFilter<TreatmentAttributes> = {
      ...this.baseFilter(clinicId),
      patientId: toObjectId(patientId, 'patientId'),
    };
    if (filters.status !== undefined) {
      filter.status = filters.status;
    }

    return TreatmentModel.find(filter).sort({ createdAt: -1 }).lean<TreatmentRecord[]>().exec();
  }

  /**
   * The course currently occupying the patient's single care slot.
   *
   * ACTIVE or PAUSED both count: a paused patient still has an appliance fitted,
   * so opening a second course alongside it would be a data-entry mistake.
   */
  async findOccupyingForPatient(
    patientId: string,
    clinicId: string,
  ): Promise<TreatmentRecord | null> {
    return TreatmentModel.findOne({
      ...this.baseFilter(clinicId),
      patientId: toObjectId(patientId, 'patientId'),
      status: { $in: [...OCCUPYING_TREATMENT_STATUSES] },
    })
      .sort({ createdAt: -1 })
      .lean<TreatmentRecord | null>()
      .exec();
  }

  async create(input: CreateTreatmentInput): Promise<TreatmentRecord> {
    const [created] = await TreatmentModel.create([
      {
        // Tenant and doctor come from verified server-side context, never a payload.
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        patientId: toObjectId(input.patientId, 'patientId'),
        doctorId: toObjectId(input.doctorId, 'doctorId'),
        createdBy: toObjectId(input.createdBy, 'createdBy'),
        treatmentType: input.treatmentType,
        status: input.status ?? TREATMENT_STATUSES.PLANNED,
        startDate: input.startDate ?? null,
        expectedEndDate: input.expectedEndDate ?? null,
        actualEndDate: null,
        notes: input.notes ?? null,
        totalPlannedCost: input.totalPlannedCost ?? null,
        cancellationReason: null,
        updatedBy: null,
      },
    ]);

    if (!created) {
      throw new Error('Treatment creation returned no document');
    }

    return created.toObject<TreatmentRecord>();
  }

  async update(
    treatmentId: string,
    clinicId: string,
    changes: UpdateTreatmentFields,
  ): Promise<TreatmentRecord | null> {
    const set: Record<string, unknown> = {
      updatedBy: toObjectId(changes.updatedBy, 'updatedBy'),
    };

    if (changes.treatmentType !== undefined) set.treatmentType = changes.treatmentType;
    if (changes.startDate !== undefined) set.startDate = changes.startDate;
    if (changes.expectedEndDate !== undefined) set.expectedEndDate = changes.expectedEndDate;
    if (changes.notes !== undefined) set.notes = changes.notes;
    if (changes.totalPlannedCost !== undefined) set.totalPlannedCost = changes.totalPlannedCost;

    return TreatmentModel.findOneAndUpdate(
      { ...this.baseFilter(clinicId), _id: toObjectId(treatmentId, 'treatmentId') },
      { $set: set },
      { new: true, runValidators: true },
    )
      .lean<TreatmentRecord | null>()
      .exec();
  }

  /**
   * Moves a treatment to a new status.
   *
   * `expectedFrom` is part of the filter rather than a prior read, so two
   * simultaneous "complete" clicks cannot both succeed: the second matches no
   * document and the service turns that into an invalid-transition error.
   */
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
    if (changes.actualEndDate !== undefined) set.actualEndDate = changes.actualEndDate;
    if (changes.cancellationReason !== undefined) {
      set.cancellationReason = changes.cancellationReason;
    }

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

  // --- progress timeline ----------------------------------------------------

  async createProgress(input: CreateTreatmentProgressInput): Promise<TreatmentProgressRecord> {
    const [created] = await TreatmentProgressModel.create([
      {
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        patientId: toObjectId(input.patientId, 'patientId'),
        treatmentId: toObjectId(input.treatmentId, 'treatmentId'),
        createdBy: toObjectId(input.createdBy, 'createdBy'),
        occurredAt: input.occurredAt,
        type: input.type,
        note: input.note ?? null,
      },
    ]);

    if (!created) {
      throw new Error('Treatment progress creation returned no document');
    }

    return created.toObject<TreatmentProgressRecord>();
  }

  async listProgressByTreatment(
    treatmentId: string,
    clinicId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<TreatmentProgressRecord>> {
    const filter: QueryFilter<TreatmentProgressAttributes> = {
      clinicId: toObjectId(clinicId, 'clinicId'),
      treatmentId: toObjectId(treatmentId, 'treatmentId'),
    };

    const [items, total] = await Promise.all([
      TreatmentProgressModel.find(filter)
        .sort({ occurredAt: -1, createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<TreatmentProgressRecord[]>()
        .exec(),
      TreatmentProgressModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  /**
   * Timelines for several treatments at once.
   *
   * The patient profile shows every course with its diary; without this the
   * page would issue one query per treatment.
   */
  async listProgressByTreatmentIds(
    treatmentIds: string[],
    clinicId: string,
  ): Promise<TreatmentProgressRecord[]> {
    if (treatmentIds.length === 0) {
      return [];
    }

    return TreatmentProgressModel.find({
      clinicId: toObjectId(clinicId, 'clinicId'),
      treatmentId: { $in: treatmentIds.map((id) => toObjectId(id, 'treatmentId')) },
    })
      .sort({ occurredAt: -1, createdAt: -1 })
      .lean<TreatmentProgressRecord[]>()
      .exec();
  }
}

export const treatmentRepository = new TreatmentRepository();

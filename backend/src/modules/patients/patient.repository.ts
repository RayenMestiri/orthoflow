import type { QueryFilter } from 'mongoose';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { containsInsensitive } from '../../infrastructure/database/query.helpers.js';
import { PatientModel } from './patient.model.js';
import {
  PATIENT_STATUSES,
  type CreatePatientInput,
  type PatientAttributes,
  type PatientListFilters,
  type PatientRecord,
  type UpdatePatientInput,
} from './patient.types.js';

/**
 * Persistence for patients.
 *
 * TENANCY RULE — the reason this class exists: `clinicId` is a required
 * parameter of every method, and it always lands in the Mongo filter. There is
 * no `findById(patientId)` anywhere in this file, because such a method would be
 * a cross-tenant read waiting to be called from the wrong place.
 */
export class PatientRepository {
  private baseFilter(clinicId: string): QueryFilter<PatientAttributes> {
    return { clinicId: toObjectId(clinicId, 'clinicId') };
  }

  async findByIdInClinic(patientId: string, clinicId: string): Promise<PatientRecord | null> {
    return PatientModel.findOne({
      ...this.baseFilter(clinicId),
      _id: toObjectId(patientId, 'patientId'),
    })
      .lean<PatientRecord | null>()
      .exec();
  }

  async listByClinic(
    clinicId: string,
    filters: PatientListFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<PatientRecord>> {
    const filter: QueryFilter<PatientAttributes> = this.baseFilter(clinicId);

    filter.status = filters.status ?? PATIENT_STATUSES.ACTIVE;

    if (filters.search !== undefined && filters.search.length > 0) {
      // The term is escaped before it becomes a regex — see `containsInsensitive`.
      const term = containsInsensitive(filters.search);
      filter.$or = [
        { firstName: term },
        { lastName: term },
        { phone: term },
        { referenceNumber: term },
      ];
    }

    const direction: 1 | -1 = filters.sortOrder === 'desc' ? -1 : 1;
    const sort: Record<string, 1 | -1> =
      filters.sortBy === 'createdAt'
        ? { createdAt: direction }
        : filters.sortBy === 'birthDate'
          ? { birthDate: direction, lastName: 1, firstName: 1 }
          : { lastName: direction, firstName: direction };

    const [items, total] = await Promise.all([
      PatientModel.find(filter)
        .sort(sort)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<PatientRecord[]>()
        .exec(),
      PatientModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async create(input: CreatePatientInput): Promise<PatientRecord> {
    const [created] = await PatientModel.create([
      {
        // Taken from the verified tenant context, never from the request body.
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        createdBy: toObjectId(input.createdBy, 'createdBy'),
        firstName: input.firstName,
        lastName: input.lastName,
        referenceNumber: input.referenceNumber?.toUpperCase() ?? null,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        ...(input.gender === undefined ? {} : { gender: input.gender }),
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: {
          line1: input.address?.line1 ?? null,
          city: input.address?.city ?? null,
          postalCode: input.address?.postalCode ?? null,
          country: input.address?.country ?? null,
        },
        notes: input.notes ?? null,
      },
    ]);

    if (!created) {
      throw new Error('Patient creation returned no document');
    }

    return created.toObject<PatientRecord>();
  }

  async update(
    patientId: string,
    clinicId: string,
    changes: UpdatePatientInput,
  ): Promise<PatientRecord | null> {
    const set: Record<string, unknown> = {};

    if (changes.firstName !== undefined) set.firstName = changes.firstName;
    if (changes.lastName !== undefined) set.lastName = changes.lastName;
    if (changes.referenceNumber !== undefined) {
      set.referenceNumber = changes.referenceNumber?.toUpperCase() ?? null;
    }
    if (changes.gender !== undefined) set.gender = changes.gender;
    if (changes.phone !== undefined) set.phone = changes.phone;
    if (changes.email !== undefined) set.email = changes.email;
    if (changes.notes !== undefined) set.notes = changes.notes;
    if (changes.status !== undefined) set.status = changes.status;
    if (changes.birthDate !== undefined) {
      set.birthDate = changes.birthDate ? new Date(changes.birthDate) : null;
    }
    if (changes.address !== undefined) {
      for (const [key, value] of Object.entries(changes.address)) {
        set[`address.${key}`] = value ?? null;
      }
    }

    if (Object.keys(set).length === 0) {
      return this.findByIdInClinic(patientId, clinicId);
    }

    return PatientModel.findOneAndUpdate(
      { ...this.baseFilter(clinicId), _id: toObjectId(patientId, 'patientId') },
      { $set: set },
      { new: true, runValidators: true },
    )
      .lean<PatientRecord | null>()
      .exec();
  }

  /**
   * Archive instead of delete.
   *
   * The filter demands the patient is currently ACTIVE, so a double archive is a
   * no-op the service can detect rather than a silently re-stamped timestamp.
   */
  async archive(
    patientId: string,
    clinicId: string,
    archivedBy: string,
  ): Promise<PatientRecord | null> {
    return PatientModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(patientId, 'patientId'),
        status: PATIENT_STATUSES.ACTIVE,
      },
      {
        $set: {
          status: PATIENT_STATUSES.ARCHIVED,
          archivedAt: new Date(),
          archivedBy: toObjectId(archivedBy, 'archivedBy'),
        },
      },
      { new: true },
    )
      .lean<PatientRecord | null>()
      .exec();
  }

  async restore(patientId: string, clinicId: string): Promise<PatientRecord | null> {
    return PatientModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        _id: toObjectId(patientId, 'patientId'),
        status: PATIENT_STATUSES.ARCHIVED,
      },
      { $set: { status: PATIENT_STATUSES.ACTIVE, archivedAt: null, archivedBy: null } },
      { new: true },
    )
      .lean<PatientRecord | null>()
      .exec();
  }
}

export const patientRepository = new PatientRepository();

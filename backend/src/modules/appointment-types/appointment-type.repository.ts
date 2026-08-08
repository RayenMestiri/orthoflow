import type { ClientSession, QueryFilter } from 'mongoose';
import { toObjectId } from '../../common/utils/object-id.js';
import { AppointmentTypeModel } from './appointment-type.model.js';
import type {
  AppointmentTypeAttributes,
  AppointmentTypeListFilters,
  AppointmentTypeRecord,
  CreateAppointmentTypeInput,
  UpdateAppointmentTypeInput,
} from './appointment-type.types.js';

/**
 * Persistence for appointment types.
 *
 * TENANCY RULE: `clinicId` is a required parameter of every method and always
 * lands in the filter — there is no lookup by id alone.
 */
export class AppointmentTypeRepository {
  async listByClinic(
    clinicId: string,
    filters: AppointmentTypeListFilters = {},
  ): Promise<AppointmentTypeRecord[]> {
    const filter: QueryFilter<AppointmentTypeAttributes> = {
      clinicId: toObjectId(clinicId, 'clinicId'),
    };
    if (filters.isActive !== undefined) {
      filter.isActive = filters.isActive;
    }

    return AppointmentTypeModel.find(filter)
      .sort({ name: 1 })
      // A clinic offering more than 100 visit kinds is a data problem, not a
      // paging problem — but the query still must not be unbounded.
      .limit(100)
      .lean<AppointmentTypeRecord[]>()
      .exec();
  }

  async findByIdInClinic(
    appointmentTypeId: string,
    clinicId: string,
  ): Promise<AppointmentTypeRecord | null> {
    return AppointmentTypeModel.findOne({
      _id: toObjectId(appointmentTypeId, 'appointmentTypeId'),
      clinicId: toObjectId(clinicId, 'clinicId'),
    })
      .lean<AppointmentTypeRecord | null>()
      .exec();
  }

  async findManyByIdsInClinic(
    appointmentTypeIds: string[],
    clinicId: string,
  ): Promise<AppointmentTypeRecord[]> {
    if (appointmentTypeIds.length === 0) {
      return [];
    }
    return AppointmentTypeModel.find({
      _id: { $in: appointmentTypeIds.map((id) => toObjectId(id, 'appointmentTypeId')) },
      clinicId: toObjectId(clinicId, 'clinicId'),
    })
      .limit(appointmentTypeIds.length)
      .lean<AppointmentTypeRecord[]>()
      .exec();
  }

  async create(
    input: CreateAppointmentTypeInput,
    session?: ClientSession,
  ): Promise<AppointmentTypeRecord> {
    const [created] = await AppointmentTypeModel.create(
      [
        {
          clinicId: toObjectId(input.clinicId, 'clinicId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          name: input.name,
          durationMinutes: input.durationMinutes,
          color: input.color ?? null,
          description: input.description ?? null,
        },
      ],
      { session, ordered: true },
    );

    if (!created) {
      throw new Error('Appointment type creation returned no document');
    }

    return created.toObject<AppointmentTypeRecord>();
  }

  async createMany(
    inputs: CreateAppointmentTypeInput[],
    session?: ClientSession,
  ): Promise<AppointmentTypeRecord[]> {
    if (inputs.length === 0) {
      return [];
    }

    const created = await AppointmentTypeModel.create(
      inputs.map((input) => ({
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        createdBy: toObjectId(input.createdBy, 'createdBy'),
        name: input.name,
        durationMinutes: input.durationMinutes,
        color: input.color ?? null,
        description: input.description ?? null,
      })),
      { session, ordered: true },
    );

    return created.map((document) => document.toObject<AppointmentTypeRecord>());
  }

  async update(
    appointmentTypeId: string,
    clinicId: string,
    changes: UpdateAppointmentTypeInput,
  ): Promise<AppointmentTypeRecord | null> {
    const set: Record<string, unknown> = {};

    if (changes.name !== undefined) set.name = changes.name;
    if (changes.durationMinutes !== undefined) set.durationMinutes = changes.durationMinutes;
    if (changes.color !== undefined) set.color = changes.color;
    if (changes.description !== undefined) set.description = changes.description;
    if (changes.isActive !== undefined) set.isActive = changes.isActive;

    if (Object.keys(set).length === 0) {
      return this.findByIdInClinic(appointmentTypeId, clinicId);
    }

    return AppointmentTypeModel.findOneAndUpdate(
      {
        _id: toObjectId(appointmentTypeId, 'appointmentTypeId'),
        clinicId: toObjectId(clinicId, 'clinicId'),
      },
      { $set: set },
      { new: true, runValidators: true },
    )
      .lean<AppointmentTypeRecord | null>()
      .exec();
  }

  async countForClinic(clinicId: string): Promise<number> {
    return AppointmentTypeModel.countDocuments({
      clinicId: toObjectId(clinicId, 'clinicId'),
    }).exec();
  }
}

export const appointmentTypeRepository = new AppointmentTypeRepository();

import type { ClientSession, QueryFilter } from 'mongoose';
import { toObjectId } from '../../common/utils/object-id.js';
import { ClinicModel } from './clinic.model.js';
import {
  CLINIC_STATUSES,
  type ClinicAttributes,
  type ClinicRecord,
  type CreateClinicInput,
  type UpdateClinicInput,
} from './clinic.types.js';

export class ClinicRepository {
  async findById(clinicId: string): Promise<ClinicRecord | null> {
    return ClinicModel.findById(toObjectId(clinicId, 'clinicId'))
      .lean<ClinicRecord | null>()
      .exec();
  }

  async isActiveClinic(clinicId: string): Promise<boolean> {
    const found = await ClinicModel.exists({
      _id: toObjectId(clinicId, 'clinicId'),
      status: CLINIC_STATUSES.ACTIVE,
    }).exec();
    return found !== null;
  }

  async findManyByIds(clinicIds: string[]): Promise<ClinicRecord[]> {
    if (clinicIds.length === 0) {
      return [];
    }
    return ClinicModel.find({
      _id: { $in: clinicIds.map((id) => toObjectId(id, 'clinicId')) },
    })
      .limit(clinicIds.length)
      .lean<ClinicRecord[]>()
      .exec();
  }

  /** Bounded cursor used by background clinic-scoped maintenance jobs. */
  async listActiveAfter(afterId: string | null, limit: number): Promise<ClinicRecord[]> {
    return ClinicModel.find({
      status: CLINIC_STATUSES.ACTIVE,
      ...(afterId ? { _id: { $gt: toObjectId(afterId, 'afterId') } } : {}),
    })
      .sort({ _id: 1 })
      .limit(limit)
      .lean<ClinicRecord[]>()
      .exec();
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const found = await ClinicModel.exists({ slug: slug.toLowerCase() }).exec();
    return found !== null;
  }

  async create(input: CreateClinicInput, session?: ClientSession): Promise<ClinicRecord> {
    const [created] = await ClinicModel.create(
      [
        {
          name: input.name,
          slug: input.slug,
          legalName: input.legalName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: {
            line1: input.address?.line1 ?? null,
            line2: input.address?.line2 ?? null,
            city: input.address?.city ?? null,
            postalCode: input.address?.postalCode ?? null,
            country: input.address?.country ?? null,
          },
          ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
          ...(input.currency === undefined ? {} : { currency: input.currency }),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
        },
      ],
      { session, ordered: true },
    );

    if (!created) {
      throw new Error('Clinic creation returned no document');
    }

    return created.toObject<ClinicRecord>();
  }

  async update(clinicId: string, changes: UpdateClinicInput): Promise<ClinicRecord | null> {
    const set: Record<string, unknown> = {};

    if (changes.name !== undefined) set.name = changes.name;
    if (changes.legalName !== undefined) set.legalName = changes.legalName;
    if (changes.email !== undefined) set.email = changes.email;
    if (changes.phone !== undefined) set.phone = changes.phone;
    if (changes.timezone !== undefined) set.timezone = changes.timezone;
    if (changes.currency !== undefined) set.currency = changes.currency;
    if (changes.address !== undefined) {
      for (const [key, value] of Object.entries(changes.address)) {
        set[`address.${key}`] = value ?? null;
      }
    }
    // Replaced whole: a partial week would leave the calendar with gaps the
    // conflict checks could not reason about.

    if (Object.keys(set).length === 0) {
      return this.findById(clinicId);
    }

    const filter: QueryFilter<ClinicAttributes> = { _id: toObjectId(clinicId, 'clinicId') };

    return ClinicModel.findOneAndUpdate(filter, { $set: set }, { new: true, runValidators: true })
      .lean<ClinicRecord | null>()
      .exec();
  }
}

export const clinicRepository = new ClinicRepository();

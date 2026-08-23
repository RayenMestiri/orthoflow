import type { ClientSession, QueryFilter } from 'mongoose';
import { containsInsensitive } from '../../infrastructure/database/query.helpers.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { GuardianModel } from './guardian.model.js';
import type {
  CreateGuardianInput,
  GuardianAttributes,
  GuardianRecord,
  UpdateGuardianInput,
} from './guardian.types.js';

export class GuardianRepository {
  private baseFilter(clinicId: string): QueryFilter<GuardianAttributes> {
    return { clinicId: toObjectId(clinicId, 'clinicId') };
  }

  async create(
    clinicId: string,
    createdBy: string,
    input: CreateGuardianInput,
    session?: ClientSession,
  ): Promise<GuardianRecord> {
    const [created] = await GuardianModel.create(
      [
        {
          clinicId: toObjectId(clinicId, 'clinicId'),
          createdBy: toObjectId(createdBy, 'createdBy'),
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          email: input.email ?? null,
        },
      ],
      { session, ordered: true },
    );
    if (!created) throw new Error('Guardian creation returned no document');
    return created.toObject<GuardianRecord>();
  }

  async findManyByIdsInClinic(guardianIds: string[], clinicId: string): Promise<GuardianRecord[]> {
    if (guardianIds.length === 0) return [];
    return GuardianModel.find({
      ...this.baseFilter(clinicId),
      _id: { $in: guardianIds.map((id) => toObjectId(id, 'guardianId')) },
    })
      .limit(guardianIds.length)
      .lean<GuardianRecord[]>()
      .exec();
  }

  async findByIdInClinic(guardianId: string, clinicId: string): Promise<GuardianRecord | null> {
    return GuardianModel.findOne({
      ...this.baseFilter(clinicId),
      _id: toObjectId(guardianId, 'guardianId'),
    })
      .lean<GuardianRecord | null>()
      .exec();
  }

  async searchInClinic(clinicId: string, query: string, limit = 20): Promise<GuardianRecord[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return GuardianModel.find(this.baseFilter(clinicId))
        .sort({ lastName: 1, firstName: 1 })
        .limit(limit)
        .lean<GuardianRecord[]>()
        .exec();
    }
    const escaped = containsInsensitive(trimmed);
    return GuardianModel.find({
      ...this.baseFilter(clinicId),
      $or: [
        { firstName: escaped },
        { lastName: escaped },
        { phone: escaped },
        { email: escaped },
      ],
    })
      .sort({ lastName: 1, firstName: 1 })
      .limit(limit)
      .lean<GuardianRecord[]>()
      .exec();
  }

  async updateInClinic(
    guardianId: string,
    clinicId: string,
    changes: UpdateGuardianInput,
    session?: ClientSession,
  ): Promise<GuardianRecord | null> {
    const set: Record<string, unknown> = {};
    if (changes.firstName !== undefined) set.firstName = changes.firstName;
    if (changes.lastName !== undefined) set.lastName = changes.lastName;
    if (changes.phone !== undefined) set.phone = changes.phone;
    if (changes.email !== undefined) set.email = changes.email;
    const query = GuardianModel.findOneAndUpdate(
      { ...this.baseFilter(clinicId), _id: toObjectId(guardianId, 'guardianId') },
      { $set: set },
      { new: true, runValidators: true },
    );
    if (session) query.session(session);
    return query.lean<GuardianRecord | null>().exec();
  }
}

export const guardianRepository = new GuardianRepository();

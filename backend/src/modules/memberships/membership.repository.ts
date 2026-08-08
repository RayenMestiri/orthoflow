import type { ClientSession, QueryFilter } from 'mongoose';
import { CLINIC_ROLES, MEMBERSHIP_STATUSES } from '../../common/constants/roles.js';
import { toObjectId } from '../../common/utils/object-id.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { ClinicMembershipModel } from './membership.model.js';
import type {
  ClinicMembershipAttributes,
  CreateMembershipInput,
  MembershipListFilters,
  MembershipRecord,
  UpdateMembershipInput,
} from './membership.types.js';

/**
 * Persistence for clinic memberships.
 *
 * TENANCY RULE: every method that reads or writes a specific membership takes
 * `clinicId` and puts it in the filter. Looking a membership up by its id alone
 * would let a clinic owner mutate a membership belonging to another practice
 * simply by guessing an id.
 */
export class MembershipRepository {
  /** All clinics a person can currently work in. Used on every request. */
  async findActiveByUser(userId: string): Promise<MembershipRecord[]> {
    return ClinicMembershipModel.find({
      userId: toObjectId(userId, 'userId'),
      status: MEMBERSHIP_STATUSES.ACTIVE,
    })
      .lean<MembershipRecord[]>()
      .exec();
  }

  async findByUserAndClinic(userId: string, clinicId: string): Promise<MembershipRecord | null> {
    return ClinicMembershipModel.findOne({
      userId: toObjectId(userId, 'userId'),
      clinicId: toObjectId(clinicId, 'clinicId'),
    })
      .lean<MembershipRecord | null>()
      .exec();
  }

  async findByIdInClinic(membershipId: string, clinicId: string): Promise<MembershipRecord | null> {
    return ClinicMembershipModel.findOne({
      _id: toObjectId(membershipId, 'membershipId'),
      clinicId: toObjectId(clinicId, 'clinicId'),
    })
      .lean<MembershipRecord | null>()
      .exec();
  }

  async listByClinic(
    clinicId: string,
    filters: MembershipListFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<MembershipRecord>> {
    const filter: QueryFilter<ClinicMembershipAttributes> = {
      clinicId: toObjectId(clinicId, 'clinicId'),
    };
    if (filters.status !== undefined) {
      filter.status = filters.status;
    }
    if (filters.role !== undefined) {
      filter.role = filters.role;
    }

    const [items, total] = await Promise.all([
      ClinicMembershipModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<MembershipRecord[]>()
        .exec(),
      ClinicMembershipModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async create(input: CreateMembershipInput, session?: ClientSession): Promise<MembershipRecord> {
    const status = input.status ?? MEMBERSHIP_STATUSES.ACTIVE;
    const [created] = await ClinicMembershipModel.create(
      [
        {
          userId: toObjectId(input.userId, 'userId'),
          clinicId: toObjectId(input.clinicId, 'clinicId'),
          role: input.role,
          status,
          invitedBy: input.invitedBy ? toObjectId(input.invitedBy, 'invitedBy') : null,
          joinedAt: status === MEMBERSHIP_STATUSES.ACTIVE ? new Date() : null,
        },
      ],
      { session, ordered: true },
    );

    if (!created) {
      throw new Error('Membership creation returned no document');
    }

    return created.toObject<MembershipRecord>();
  }

  async update(
    membershipId: string,
    clinicId: string,
    changes: UpdateMembershipInput,
  ): Promise<MembershipRecord | null> {
    const set: Record<string, unknown> = {};

    if (changes.role !== undefined) {
      set.role = changes.role;
    }
    if (changes.status !== undefined) {
      set.status = changes.status;
      set.removedAt = changes.status === MEMBERSHIP_STATUSES.REMOVED ? new Date() : null;
      if (changes.status === MEMBERSHIP_STATUSES.ACTIVE) {
        set.joinedAt = new Date();
      }
    }

    if (Object.keys(set).length === 0) {
      return this.findByIdInClinic(membershipId, clinicId);
    }

    return ClinicMembershipModel.findOneAndUpdate(
      {
        _id: toObjectId(membershipId, 'membershipId'),
        clinicId: toObjectId(clinicId, 'clinicId'),
      },
      { $set: set },
      { new: true, runValidators: true },
    )
      .lean<MembershipRecord | null>()
      .exec();
  }

  /**
   * Guards the "a clinic always has an owner" invariant. Counting owners other
   * than the one being changed is done by the service.
   */
  async countActiveOwners(clinicId: string): Promise<number> {
    return ClinicMembershipModel.countDocuments({
      clinicId: toObjectId(clinicId, 'clinicId'),
      role: CLINIC_ROLES.CLINIC_OWNER,
      status: MEMBERSHIP_STATUSES.ACTIVE,
    }).exec();
  }
}

export const membershipRepository = new MembershipRepository();

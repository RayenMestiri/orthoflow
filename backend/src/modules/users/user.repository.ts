import type { ClientSession } from 'mongoose';
import { PLATFORM_ROLES } from '../../common/constants/roles.js';
import { toObjectId } from '../../common/utils/object-id.js';
import { UserModel } from './user.model.js';
import {
  USER_STATUSES,
  type CreateUserInput,
  type SafeUserRecord,
  type UserRecord,
} from './user.types.js';

/**
 * All MongoDB access for the `users` collection.
 *
 * Users are the one entity that is intentionally NOT clinic-scoped: a person
 * exists once on the platform and gains clinic authority through memberships.
 * Because of that, every method here is either id/email-exact or explicitly
 * bounded — there is no "list all users" query by design.
 */
export class UserRepository {
  async findById(userId: string): Promise<SafeUserRecord | null> {
    return UserModel.findById(toObjectId(userId, 'userId')).lean<SafeUserRecord | null>().exec();
  }

  async findByEmail(email: string): Promise<SafeUserRecord | null> {
    return UserModel.findOne({ email: email.toLowerCase() }).lean<SafeUserRecord | null>().exec();
  }

  /**
   * Loads a user together with the password digest.
   * Only the authentication service may call this.
   */
  async findByEmailForAuthentication(email: string): Promise<UserRecord | null> {
    return UserModel.findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .lean<UserRecord | null>()
      .exec();
  }

  async create(input: CreateUserInput, session?: ClientSession): Promise<SafeUserRecord> {
    const [created] = await UserModel.create(
      [
        {
          email: input.email.toLowerCase(),
          passwordHash: input.passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          platformRole: input.platformRole ?? PLATFORM_ROLES.USER,
          status: USER_STATUSES.ACTIVE,
        },
      ],
      { session, ordered: true },
    );

    if (!created) {
      throw new Error('User creation returned no document');
    }

    const { passwordHash: _passwordHash, ...safe } = created.toObject<UserRecord>();
    return safe;
  }

  async markLoggedIn(userId: string, at: Date): Promise<void> {
    await UserModel.updateOne(
      { _id: toObjectId(userId, 'userId') },
      { $set: { lastLoginAt: at } },
    ).exec();
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await UserModel.updateOne(
      { _id: toObjectId(userId, 'userId') },
      { $set: { passwordHash } },
    ).exec();
  }

  async markEmailVerified(userId: string, at: Date): Promise<void> {
    await UserModel.updateOne(
      { _id: toObjectId(userId, 'userId'), emailVerifiedAt: null },
      { $set: { emailVerifiedAt: at } },
    ).exec();
  }

  /** True when no account exists yet — used to gate platform bootstrap. */
  async isEmpty(): Promise<boolean> {
    const count = await UserModel.estimatedDocumentCount().exec();
    return count === 0;
  }

  /** Bounded lookup used to resolve membership listings into people. */
  async findManyByIds(userIds: string[]): Promise<SafeUserRecord[]> {
    if (userIds.length === 0) {
      return [];
    }
    return UserModel.find({ _id: { $in: userIds.map((id) => toObjectId(id, 'userId')) } })
      .limit(userIds.length)
      .lean<SafeUserRecord[]>()
      .exec();
  }
}

export const userRepository = new UserRepository();

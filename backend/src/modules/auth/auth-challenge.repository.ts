import { toObjectId } from '../../common/utils/object-id.js';
import { AuthChallengeModel } from './auth-challenge.model.js';
import type { AuthChallengePurpose, AuthChallengeRecord } from './auth-challenge.types.js';

export interface IssueAuthChallengeInput {
  userId: string;
  purpose: AuthChallengePurpose;
  codeHash: string;
  maxAttempts: number;
  expiresAt: Date;
  sentAt: Date;
}

export class AuthChallengeRepository {
  async issue(input: IssueAuthChallengeInput): Promise<void> {
    await AuthChallengeModel.findOneAndUpdate(
      { userId: toObjectId(input.userId, 'userId'), purpose: input.purpose },
      {
        $set: {
          codeHash: input.codeHash,
          attempts: 0,
          maxAttempts: input.maxAttempts,
          expiresAt: input.expiresAt,
          consumedAt: null,
          sentAt: input.sentAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
  }

  async find(userId: string, purpose: AuthChallengePurpose): Promise<AuthChallengeRecord | null> {
    return AuthChallengeModel.findOne({
      userId: toObjectId(userId, 'userId'),
      purpose,
    })
      .lean<AuthChallengeRecord | null>()
      .exec();
  }

  async consumeIfValid(
    userId: string,
    purpose: AuthChallengePurpose,
    codeHash: string,
    now: Date,
  ): Promise<boolean> {
    const consumed = await AuthChallengeModel.findOneAndUpdate(
      {
        userId: toObjectId(userId, 'userId'),
        purpose,
        codeHash,
        consumedAt: null,
        expiresAt: { $gt: now },
        $expr: { $lt: ['$attempts', '$maxAttempts'] },
      },
      { $set: { consumedAt: now } },
      { new: true },
    ).exec();
    return consumed !== null;
  }

  async recordFailedAttempt(
    userId: string,
    purpose: AuthChallengePurpose,
    now: Date,
  ): Promise<void> {
    await AuthChallengeModel.updateOne(
      {
        userId: toObjectId(userId, 'userId'),
        purpose,
        consumedAt: null,
        expiresAt: { $gt: now },
        $expr: { $lt: ['$attempts', '$maxAttempts'] },
      },
      { $inc: { attempts: 1 } },
    ).exec();
  }

  async clearCooldown(userId: string, purpose: AuthChallengePurpose): Promise<void> {
    await AuthChallengeModel.updateOne(
      { userId: toObjectId(userId, 'userId'), purpose },
      { $set: { sentAt: new Date(0) } },
    ).exec();
  }
}

export const authChallengeRepository = new AuthChallengeRepository();

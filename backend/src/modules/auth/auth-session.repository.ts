import type { ClientSession } from 'mongoose';
import { toObjectId } from '../../common/utils/object-id.js';
import { AuthSessionModel } from './auth-session.model.js';
import type { AuthSessionRecord, CreateSessionInput, SessionRevokeReason } from './auth.types.js';

export class AuthSessionRepository {
  async create(input: CreateSessionInput, session?: ClientSession): Promise<AuthSessionRecord> {
    const [created] = await AuthSessionModel.create(
      [
        {
          _id: toObjectId(input.sessionId, 'sessionId'),
          userId: toObjectId(input.userId, 'userId'),
          familyId: input.familyId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          ip: input.ip ?? null,
          userAgent: input.userAgent?.slice(0, 256) ?? null,
        },
      ],
      { session, ordered: true },
    );

    if (!created) {
      throw new Error('Auth session creation returned no document');
    }

    return created.toObject<AuthSessionRecord>();
  }

  async findById(sessionId: string): Promise<AuthSessionRecord | null> {
    return AuthSessionModel.findById(toObjectId(sessionId, 'sessionId'))
      .lean<AuthSessionRecord | null>()
      .exec();
  }

  /**
   * Atomically revokes a session that is still active.
   *
   * The `revokedAt: null` guard makes rotation race-safe: two concurrent
   * refreshes with the same token cannot both win, so the loser is treated as a
   * replay rather than silently issuing a second valid token pair.
   */
  async revokeIfActive(
    sessionId: string,
    reason: SessionRevokeReason,
    replacedBySessionId?: string | null,
  ): Promise<AuthSessionRecord | null> {
    return AuthSessionModel.findOneAndUpdate(
      { _id: toObjectId(sessionId, 'sessionId'), revokedAt: null },
      {
        $set: {
          revokedAt: new Date(),
          revokedReason: reason,
          replacedBySessionId: replacedBySessionId
            ? toObjectId(replacedBySessionId, 'replacedBySessionId')
            : null,
        },
      },
      { new: true },
    )
      .lean<AuthSessionRecord | null>()
      .exec();
  }

  /** Burns every token derived from one login. Used on replay detection. */
  async revokeFamily(
    userId: string,
    familyId: string,
    reason: SessionRevokeReason,
  ): Promise<number> {
    const result = await AuthSessionModel.updateMany(
      { userId: toObjectId(userId, 'userId'), familyId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    ).exec();
    return result.modifiedCount;
  }

  /** Signs the user out everywhere (logout-all, password change). */
  async revokeAllForUser(userId: string, reason: SessionRevokeReason): Promise<number> {
    const result = await AuthSessionModel.updateMany(
      { userId: toObjectId(userId, 'userId'), revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    ).exec();
    return result.modifiedCount;
  }

  /** Used by the auth guard: an access token is only good while its session is. */
  async isSessionUsable(sessionId: string): Promise<boolean> {
    const found = await AuthSessionModel.exists({
      _id: toObjectId(sessionId, 'sessionId'),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).exec();
    return found !== null;
  }
}

export const authSessionRepository = new AuthSessionRepository();

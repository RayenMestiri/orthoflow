import { Schema, model } from 'mongoose';
import { SESSION_REVOKE_REASON_VALUES, type AuthSessionAttributes } from './auth.types.js';

const authSessionSchema = new Schema<AuthSessionAttributes>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    familyId: { type: String, required: true },
    // SHA-256 hex digest of the refresh token. The raw token never touches disk.
    tokenHash: { type: String, required: true },
    userAgent: { type: String, default: null, maxlength: 256 },
    ip: { type: String, default: null, maxlength: 64 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, enum: SESSION_REVOKE_REASON_VALUES, default: null },
    replacedBySessionId: { type: Schema.Types.ObjectId, ref: 'AuthSession', default: null },
  },
  {
    timestamps: true,
    collection: 'authSessions',
    strict: 'throw',
    minimize: false,
  },
);

/** Refresh lookups go through the digest, so it must be indexed and unique. */
authSessionSchema.index({ tokenHash: 1 }, { unique: true });

/** Replay containment revokes an entire family at once. */
authSessionSchema.index({ userId: 1, familyId: 1 });

/**
 * MongoDB removes expired sessions on its own. Once the refresh JWT is expired
 * the row has no security value, so there is nothing to retain.
 */
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthSessionModel = model<AuthSessionAttributes>('AuthSession', authSessionSchema);

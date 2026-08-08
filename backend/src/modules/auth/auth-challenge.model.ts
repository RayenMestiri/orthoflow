import { Schema, model } from 'mongoose';
import {
  AUTH_CHALLENGE_PURPOSE_VALUES,
  type AuthChallengeAttributes,
} from './auth-challenge.types.js';

const authChallengeSchema = new Schema<AuthChallengeAttributes>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: AUTH_CHALLENGE_PURPOSE_VALUES, required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    maxAttempts: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    sentAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: 'authChallenges',
    strict: 'throw',
    minimize: false,
  },
);

authChallengeSchema.index({ userId: 1, purpose: 1 }, { unique: true });
authChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 });

export const AuthChallengeModel = model<AuthChallengeAttributes>(
  'AuthChallenge',
  authChallengeSchema,
);

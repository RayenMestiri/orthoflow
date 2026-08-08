import type { Types } from 'mongoose';

export const AUTH_CHALLENGE_PURPOSES = {
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
} as const;

export type AuthChallengePurpose =
  (typeof AUTH_CHALLENGE_PURPOSES)[keyof typeof AUTH_CHALLENGE_PURPOSES];

export const AUTH_CHALLENGE_PURPOSE_VALUES = Object.values(AUTH_CHALLENGE_PURPOSES) as [
  AuthChallengePurpose,
  ...AuthChallengePurpose[],
];

export interface AuthChallengeAttributes {
  userId: Types.ObjectId;
  purpose: AuthChallengePurpose;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  sentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AuthChallengeRecord = AuthChallengeAttributes & { _id: Types.ObjectId };

import { Schema, model } from 'mongoose';
import { PLATFORM_ROLES, PLATFORM_ROLE_VALUES } from '../../common/constants/roles.js';
import { USER_STATUSES, USER_STATUS_VALUES, type UserAttributes } from './user.types.js';

const userSchema = new Schema<UserAttributes>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      // Uniqueness is enforced by the index below, not by application logic —
      // two concurrent registrations must not both succeed.
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
      // Excluded from every query result by default. A leak now requires an
      // explicit, greppable `.select('+passwordHash')`.
      select: false,
    },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, default: null, trim: true, maxlength: 32 },
    platformRole: {
      type: String,
      required: true,
      enum: PLATFORM_ROLE_VALUES,
      default: PLATFORM_ROLES.USER,
    },
    status: {
      type: String,
      required: true,
      enum: USER_STATUS_VALUES,
      default: USER_STATUSES.ACTIVE,
    },
    emailVerifiedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'users',
    // Reject writes that carry fields the schema does not declare, so a stray
    // `isSuperAdmin: true` in a payload can never reach the database.
    strict: 'throw',
    minimize: false,
  },
);

userSchema.index({ platformRole: 1 });

export const UserModel = model<UserAttributes>('User', userSchema);

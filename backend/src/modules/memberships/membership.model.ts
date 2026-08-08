import { Schema, model } from 'mongoose';
import {
  CLINIC_ROLE_VALUES,
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_STATUS_VALUES,
} from '../../common/constants/roles.js';
import type { ClinicMembershipAttributes } from './membership.types.js';

const membershipSchema = new Schema<ClinicMembershipAttributes>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    role: { type: String, required: true, enum: CLINIC_ROLE_VALUES },
    status: {
      type: String,
      required: true,
      enum: MEMBERSHIP_STATUS_VALUES,
      default: MEMBERSHIP_STATUSES.ACTIVE,
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    joinedAt: { type: Date, default: null },
    removedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'clinicMemberships',
    strict: 'throw',
    minimize: false,
  },
);

/**
 * One membership per (person, clinic). Re-hiring a former employee reactivates
 * the existing row rather than creating a second one, which keeps the audit
 * trail of that person at that clinic in a single place.
 */
membershipSchema.index({ userId: 1, clinicId: 1 }, { unique: true });

/** Drives the per-request authorization lookup: "which clinics may this user use?" */
membershipSchema.index({ userId: 1, status: 1 });

/** Drives the staff listing of a clinic. */
membershipSchema.index({ clinicId: 1, status: 1, role: 1 });

export const ClinicMembershipModel = model<ClinicMembershipAttributes>(
  'ClinicMembership',
  membershipSchema,
);

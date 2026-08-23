import { Schema, model } from 'mongoose';
import {
  PORTAL_SESSION_REVOKE_REASON_VALUES,
  PORTAL_USER_STATUSES,
  PORTAL_USER_STATUS_VALUES,
  type PortalDocumentShareAttributes,
  type PortalInvitationAttributes,
  type PortalSessionAttributes,
  type PortalUserAttributes,
} from './portal.types.js';

const portalUserSchema = new Schema<PortalUserAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, immutable: true },
    guardianId: { type: Schema.Types.ObjectId, ref: 'Guardian', required: true, immutable: true },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: PORTAL_USER_STATUS_VALUES,
      default: PORTAL_USER_STATUSES.ACTIVE,
      required: true,
    },
    emailVerifiedAt: { type: Date, required: true },
    lastLoginAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revocationReason: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true, collection: 'portalUsers', strict: 'throw', minimize: false },
);
portalUserSchema.index({ clinicId: 1, guardianId: 1 }, { unique: true });
portalUserSchema.index({ clinicId: 1, email: 1 }, { unique: true });
portalUserSchema.index({ email: 1 }, { unique: true });

const portalSessionSchema = new Schema<PortalSessionAttributes>(
  {
    portalUserId: { type: Schema.Types.ObjectId, ref: 'PortalUser', required: true },
    familyId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    userAgent: { type: String, default: null, maxlength: 256 },
    ip: { type: String, default: null, maxlength: 64 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, enum: PORTAL_SESSION_REVOKE_REASON_VALUES, default: null },
    replacedBySessionId: { type: Schema.Types.ObjectId, ref: 'PortalSession', default: null },
  },
  { timestamps: true, collection: 'portalSessions', strict: 'throw' },
);
portalSessionSchema.index({ tokenHash: 1 }, { unique: true });
portalSessionSchema.index({ portalUserId: 1, familyId: 1 });
portalSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const portalInvitationSchema = new Schema<PortalInvitationAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    guardianId: { type: Schema.Types.ObjectId, ref: 'Guardian', required: true },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'portalInvitations', strict: 'throw' },
);
portalInvitationSchema.index({ tokenHash: 1 }, { unique: true });
portalInvitationSchema.index({ clinicId: 1, guardianId: 1, createdAt: -1 });
portalInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const portalDocumentShareSchema = new Schema<PortalDocumentShareAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, required: true },
    patientId: { type: Schema.Types.ObjectId, required: true },
    guardianId: { type: Schema.Types.ObjectId, required: true },
    generatedDocumentId: { type: Schema.Types.ObjectId, required: true },
    sharedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sharedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'portalDocumentShares', strict: 'throw' },
);
portalDocumentShareSchema.index(
  { clinicId: 1, guardianId: 1, patientId: 1, generatedDocumentId: 1 },
  { unique: true },
);
portalDocumentShareSchema.index({ clinicId: 1, guardianId: 1, patientId: 1, revokedAt: 1 });

export const PortalUserModel = model<PortalUserAttributes>('PortalUser', portalUserSchema);
export const PortalSessionModel = model<PortalSessionAttributes>(
  'PortalSession',
  portalSessionSchema,
);
export const PortalInvitationModel = model<PortalInvitationAttributes>(
  'PortalInvitation',
  portalInvitationSchema,
);
export const PortalDocumentShareModel = model<PortalDocumentShareAttributes>(
  'PortalDocumentShare',
  portalDocumentShareSchema,
);

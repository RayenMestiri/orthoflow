import { Schema, model } from 'mongoose';
import type { GuardianAttributes } from './guardian.types.js';

const guardianSchema = new Schema<GuardianAttributes>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, default: null, trim: true, maxlength: 32 },
    email: { type: String, default: null, trim: true, lowercase: true, maxlength: 254 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'guardians',
    strict: 'throw',
  },
);

guardianSchema.index({ clinicId: 1, lastName: 1, firstName: 1 });
guardianSchema.index({ clinicId: 1, phone: 1 });
guardianSchema.index({ clinicId: 1, email: 1 });

export const GuardianModel = model<GuardianAttributes>('Guardian', guardianSchema);

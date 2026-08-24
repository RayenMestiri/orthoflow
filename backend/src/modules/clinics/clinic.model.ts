import { Schema, model } from 'mongoose';
import {
  DEFAULT_CLINIC_SETTINGS,
  DEFAULT_WORKING_HOURS,
  MAX_CONCURRENT_CAPACITY,
  CLINIC_COMMUNICATION_CHANNELS,
  SUPPORTED_LANGUAGES,
  WEEKDAYS,
} from './clinic-settings.types.js';
import { CLINIC_STATUSES, CLINIC_STATUS_VALUES, type ClinicAttributes } from './clinic.types.js';

const addressSchema = new Schema(
  {
    line1: { type: String, default: null, trim: true, maxlength: 160 },
    line2: { type: String, default: null, trim: true, maxlength: 160 },
    city: { type: String, default: null, trim: true, maxlength: 80 },
    postalCode: { type: String, default: null, trim: true, maxlength: 20 },
    country: { type: String, default: null, trim: true, maxlength: 80 },
  },
  { _id: false },
);

/* --- Clinic Settings module ------------------------------------------------
 * Operating configuration lives in its own subdocument so policy knobs never
 * become another row of loose primitives on the clinic root.
 */

const timePeriodSchema = new Schema(
  {
    start: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    end: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  },
  { _id: false },
);

/** Each weekday is an array of periods, which is what allows split shifts. */
const weeklyWorkingHoursSchema = new Schema(
  Object.fromEntries(
    WEEKDAYS.map((weekday) => [
      weekday,
      { type: [timePeriodSchema], required: true, default: () => DEFAULT_WORKING_HOURS[weekday] },
    ]),
  ),
  { _id: false },
);

const clinicSettingsSchema = new Schema(
  {
    general: {
      type: new Schema(
        {
          doctorDisplayName: { type: String, default: null, trim: true, maxlength: 120 },
          logoUrl: { type: String, default: null, trim: true, maxlength: 500 },
          defaultLanguage: {
            type: String,
            required: true,
            enum: SUPPORTED_LANGUAGES,
            default: 'fr',
          },
        },
        { _id: false },
      ),
      required: true,
      default: () => DEFAULT_CLINIC_SETTINGS.general,
    },
    workingHours: {
      type: weeklyWorkingHoursSchema,
      required: true,
      default: () => DEFAULT_WORKING_HOURS,
    },
    scheduling: {
      type: new Schema(
        {
          slotIntervalMinutes: { type: Number, required: true, default: 15, min: 5, max: 30 },
          defaultAppointmentDurationMinutes: {
            type: Number,
            required: true,
            default: 30,
            min: 5,
            max: 480,
          },
          defaultConcurrentCapacity: {
            type: Number,
            required: true,
            default: 2,
            min: 1,
            max: MAX_CONCURRENT_CAPACITY,
          },
          allowOwnerOverbooking: { type: Boolean, required: true, default: true },
        },
        { _id: false },
      ),
      required: true,
      default: () => DEFAULT_CLINIC_SETTINGS.scheduling,
    },
    careContinuity: {
      type: new Schema(
        {
          treatmentInactivityDays: { type: Number, required: true, min: 14, max: 365, default: 60 },
          retentionInactivityDays: { type: Number, required: true, min: 30, max: 730, default: 120 },
          missedAppointmentRebookGraceDays: {
            type: Number,
            required: true,
            min: 1,
            max: 90,
            default: 14,
          },
        },
        { _id: false },
      ),
      required: true,
      default: () => DEFAULT_CLINIC_SETTINGS.careContinuity,
    },
    communications: {
      type: new Schema(
        {
          appointmentRemindersEnabled: { type: Boolean, required: true, default: true },
          reminderLeadMinutes: { type: Number, required: true, min: 30, max: 10080, default: 1440 },
          channelPriority: {
            type: [String],
            enum: CLINIC_COMMUNICATION_CHANNELS,
            required: true,
            default: () => ['EMAIL'],
          },
          appointmentConfirmationsEnabled: { type: Boolean, required: true, default: true },
          appointmentCancellationNoticesEnabled: { type: Boolean, required: true, default: true },
          receiptNoticesEnabled: { type: Boolean, required: true, default: true },
          consentConfirmationsEnabled: { type: Boolean, required: true, default: true },
          documentShareNoticesEnabled: { type: Boolean, required: true, default: true },
          defaultPhoneRegion: { type: String, default: null, uppercase: true, minlength: 2, maxlength: 2 },
        },
        { _id: false },
      ),
      required: true,
      default: () => DEFAULT_CLINIC_SETTINGS.communications,
    },
  },
  { _id: false },
);

const clinicSchema = new Schema<ClinicAttributes>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
      unique: true,
    },
    legalName: { type: String, default: null, trim: true, maxlength: 160 },
    email: { type: String, default: null, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, default: null, trim: true, maxlength: 32 },
    address: { type: addressSchema, default: () => ({}) },
    timezone: { type: String, required: true, default: 'Africa/Tunis', maxlength: 64 },
    currency: {
      type: String,
      required: true,
      default: 'TND',
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    settings: {
      type: clinicSettingsSchema,
      required: true,
      default: () => DEFAULT_CLINIC_SETTINGS,
    },
    status: {
      type: String,
      required: true,
      enum: CLINIC_STATUS_VALUES,
      default: CLINIC_STATUSES.ACTIVE,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    archivedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'clinics',
    strict: 'throw',
    minimize: false,
  },
);

clinicSchema.index({ status: 1, createdAt: -1 });

export const ClinicModel = model<ClinicAttributes>('Clinic', clinicSchema);

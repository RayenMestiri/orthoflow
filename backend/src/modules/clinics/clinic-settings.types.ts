/**
 * Clinic operating configuration.
 *
 * Kept as a structured subdocument on the clinic rather than a scatter of
 * primitive fields on the root, so a new policy knob is one entry in a nested
 * object instead of another top-level column nobody can find later.
 *
 * NOTE ON TIMEZONE: the clinic's IANA timezone deliberately stays on the clinic
 * root (`clinic.timezone`) and is NOT duplicated here. It is the single
 * authoritative location, already consumed by other modules; the settings API
 * simply reads and writes that field.
 */

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/**
 * One continuous opening period, as wall-clock `HH:mm` in the clinic timezone.
 *
 * A day is an array of these, which is what makes split shifts expressible: a
 * clinic that closes for lunch has two periods, not one long one.
 */
export interface TimePeriod {
  start: string;
  end: string;
}

/** Empty array = closed that day. */
export type WeeklyWorkingHours = Record<Weekday, TimePeriod[]>;

export const SUPPORTED_LANGUAGES = ['fr', 'en', 'ar'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export interface ClinicGeneralSettings {
  /** How the owner-doctor is presented to patients, e.g. "Dr Nadia Khelifi". */
  doctorDisplayName: string | null;
  logoUrl: string | null;
  defaultLanguage: SupportedLanguage;
}

/** Slot precisions the calendar grid supports. */
export const SLOT_INTERVAL_OPTIONS = [5, 10, 15, 20, 30] as const;
export type SlotIntervalMinutes = (typeof SLOT_INTERVAL_OPTIONS)[number];

/** A solo practice running more than this in parallel is a data-entry error. */
export const MAX_CONCURRENT_CAPACITY = 10;

/**
 * Scheduling *policy*, not scheduling logic.
 *
 * This module only persists these values. Enforcement — capacity checks,
 * overlap rules, slot snapping — belongs to the Schedule module, which reads
 * them. Nothing here should ever decide whether a booking is allowed.
 */
export interface ClinicSchedulingSettings {
  /** Calendar grid precision. Not the same thing as appointment length. */
  slotIntervalMinutes: number;
  /** Fallback length when an appointment type does not specify one. */
  defaultAppointmentDurationMinutes: number;
  /** How many patients may normally overlap. Advisory, not a hard cap. */
  defaultConcurrentCapacity: number;
  /** Whether the owner-doctor may deliberately exceed that recommendation. */
  allowOwnerOverbooking: boolean;
}

export interface ClinicCareContinuitySettings {
  treatmentInactivityDays: number;
  retentionInactivityDays: number;
  missedAppointmentRebookGraceDays: number;
  /** Duration in days before temporary generated documents are automatically purged from storage. Default: 30. */
  documentRetentionDays: number;
}

export const CLINIC_COMMUNICATION_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'] as const;
export type ClinicCommunicationChannel = (typeof CLINIC_COMMUNICATION_CHANNELS)[number];

export interface ClinicCommunicationSettings {
  appointmentRemindersEnabled: boolean;
  reminderLeadMinutes: number;
  channelPriority: ClinicCommunicationChannel[];
  appointmentConfirmationsEnabled: boolean;
  appointmentCancellationNoticesEnabled: boolean;
  receiptNoticesEnabled: boolean;
  consentConfirmationsEnabled: boolean;
  documentShareNoticesEnabled: boolean;
  /** ISO 3166-1 alpha-2. Required before a phone-based channel can be enabled. */
  defaultPhoneRegion: string | null;
}

export interface ClinicSettings {
  general: ClinicGeneralSettings;
  workingHours: WeeklyWorkingHours;
  scheduling: ClinicSchedulingSettings;
  careContinuity: ClinicCareContinuitySettings;
  communications: ClinicCommunicationSettings;
}

/**
 * Tunisian orthodontic default: split morning/afternoon shifts on weekdays,
 * Saturday morning only, Sunday closed.
 */
export const DEFAULT_WORKING_HOURS: WeeklyWorkingHours = {
  monday: [
    { start: '08:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  tuesday: [
    { start: '08:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  wednesday: [{ start: '08:00', end: '13:00' }],
  thursday: [
    { start: '08:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  friday: [
    { start: '08:00', end: '12:00' },
    { start: '14:00', end: '18:00' },
  ],
  saturday: [{ start: '08:00', end: '13:00' }],
  sunday: [],
};

export const DEFAULT_CLINIC_SETTINGS: ClinicSettings = {
  general: {
    doctorDisplayName: null,
    logoUrl: null,
    defaultLanguage: 'fr',
  },
  workingHours: DEFAULT_WORKING_HOURS,
  scheduling: {
    slotIntervalMinutes: 15,
    defaultAppointmentDurationMinutes: 30,
    defaultConcurrentCapacity: 2,
    allowOwnerOverbooking: true,
  },
  careContinuity: {
    treatmentInactivityDays: 60,
    retentionInactivityDays: 120,
    missedAppointmentRebookGraceDays: 14,
    documentRetentionDays: 30,
  },
  communications: {
    appointmentRemindersEnabled: true,
    reminderLeadMinutes: 1440,
    channelPriority: ['EMAIL'],
    appointmentConfirmationsEnabled: true,
    appointmentCancellationNoticesEnabled: true,
    receiptNoticesEnabled: true,
    consentConfirmationsEnabled: true,
    documentShareNoticesEnabled: true,
    defaultPhoneRegion: null,
  },
};

// --- API shapes -------------------------------------------------------------

/** Identity fields live on the clinic root; the settings API surfaces them here. */
export interface ClinicSettingsGeneralDto {
  clinicName: string;
  doctorDisplayName: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string;
  logoUrl: string | null;
  defaultLanguage: SupportedLanguage;
}

export interface ClinicSettingsDto {
  clinicId: string;
  general: ClinicSettingsGeneralDto;
  workingHours: WeeklyWorkingHours;
  scheduling: ClinicSchedulingSettings;
  careContinuity: ClinicCareContinuitySettings;
  communications: ClinicCommunicationSettings;
  updatedAt: string;
}

export interface UpdateGeneralSettingsInput {
  clinicName?: string;
  doctorDisplayName?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  timezone?: string;
  logoUrl?: string | null;
  defaultLanguage?: SupportedLanguage;
}

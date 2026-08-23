/**
 * Clinic operating configuration — mirrors the backend DTOs.
 *
 * These are the values other modules (Schedule first) will read once wired up.
 * This feature only reads and writes them; it never interprets them.
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

export const WEEKDAY_LABELS: Readonly<Record<Weekday, string>> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

/** Weekdays only — the target for "copy Monday to weekdays". */
export const WEEKDAY_WORKING_DAYS: readonly Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
];

/** One opening period, wall-clock `HH:mm` in the clinic timezone. */
export interface TimePeriod {
  start: string;
  end: string;
}

/** Empty array = closed that day. */
export type WeeklyWorkingHours = Record<Weekday, TimePeriod[]>;

export const SUPPORTED_LANGUAGES = ['fr', 'en', 'ar'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Readonly<Record<SupportedLanguage, string>> = {
  fr: 'Français',
  en: 'English',
  ar: 'العربية',
};

export const SLOT_INTERVAL_OPTIONS = [5, 10, 15, 20, 30] as const;
export const MAX_CONCURRENT_CAPACITY = 10;
export const DEFAULT_CARE_CONTINUITY_SETTINGS: ClinicCareContinuitySettings = {
  treatmentInactivityDays: 60,
  retentionInactivityDays: 120,
  missedAppointmentRebookGraceDays: 14,
};

export interface ClinicGeneralSettings {
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

export interface ClinicSchedulingSettings {
  slotIntervalMinutes: number;
  defaultAppointmentDurationMinutes: number;
  defaultConcurrentCapacity: number;
  allowOwnerOverbooking: boolean;
}

export interface ClinicCareContinuitySettings {
  treatmentInactivityDays: number;
  retentionInactivityDays: number;
  missedAppointmentRebookGraceDays: number;
}

export interface ClinicSettings {
  clinicId: string;
  general: ClinicGeneralSettings;
  workingHours: WeeklyWorkingHours;
  scheduling: ClinicSchedulingSettings;
  careContinuity?: ClinicCareContinuitySettings;
  updatedAt: string;
}

export type UpdateGeneralSettingsInput = Partial<ClinicGeneralSettings>;

/** The settings sections the page navigates between. */
export const SETTINGS_SECTIONS = [
  'general',
  'working-hours',
  'scheduling',
  'care-continuity',
  'consents',
  'documents',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

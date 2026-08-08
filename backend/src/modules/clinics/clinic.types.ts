import type { Types } from 'mongoose';
import type { ClinicSettings } from './clinic-settings.types.js';

export const CLINIC_STATUSES = {
  ACTIVE: 'ACTIVE',
  /** Billing or compliance hold — data is retained, access is blocked. */
  SUSPENDED: 'SUSPENDED',
  /** Closed practice. Retained for financial and legal traceability. */
  ARCHIVED: 'ARCHIVED',
} as const;

export type ClinicStatus = (typeof CLINIC_STATUSES)[keyof typeof CLINIC_STATUSES];

export const CLINIC_STATUS_VALUES = Object.values(CLINIC_STATUSES) as [
  ClinicStatus,
  ...ClinicStatus[],
];

export interface ClinicAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}

/**
 * One day of the clinic's opening pattern.
 *
 * `opensAt`/`closesAt` are wall-clock `HH:mm` in the clinic's own timezone, not
 * instants: "we open at 08:00" stays true across daylight-saving changes, which
 * a stored UTC offset would not.
 */
export interface ClinicWorkingDay {
  /** 0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay()`. */
  weekday: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

/**
 * Minimal, extensible scheduling configuration.
 *
 * Deliberately not staff scheduling: the MVP is one owner-doctor, so the clinic
 * opening pattern *is* the doctor's availability. Per-practitioner hours can be
 * added later without changing this shape.
 */
export interface ClinicScheduleSettings {
  /** Calendar grid granularity in minutes. Orthodontics works in 15s. */
  slotMinutes: number;
  /** Recommended number of simultaneous patients before explicit approval is required. */
  defaultConcurrentCapacity: number;
  workingHours: ClinicWorkingDay[];
}

/** Sunday-closed, Saturday morning — a common Tunisian orthodontic pattern. */
export const DEFAULT_CLINIC_SCHEDULE: ClinicScheduleSettings = {
  slotMinutes: 15,
  defaultConcurrentCapacity: 2,
  workingHours: [
    { weekday: 0, opensAt: '08:00', closesAt: '13:00', isClosed: true },
    { weekday: 1, opensAt: '08:00', closesAt: '18:00', isClosed: false },
    { weekday: 2, opensAt: '08:00', closesAt: '18:00', isClosed: false },
    { weekday: 3, opensAt: '08:00', closesAt: '18:00', isClosed: false },
    { weekday: 4, opensAt: '08:00', closesAt: '18:00', isClosed: false },
    { weekday: 5, opensAt: '08:00', closesAt: '18:00', isClosed: false },
    { weekday: 6, opensAt: '08:00', closesAt: '13:00', isClosed: false },
  ],
};

/**
 * The tenant root.
 *
 * Every business document in OrthoFlow carries a `clinicId` pointing here, and
 * every query is filtered by it. A clinic is the boundary that guarantees one
 * practice can never read another practice's patients or money.
 */
export interface ClinicAttributes {
  name: string;
  /** Stable, human-friendly identifier. Unique across the platform. */
  slug: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  address: ClinicAddress;
  /** IANA timezone — appointments are stored in UTC and displayed in this zone. */
  timezone: string;
  /** ISO-4217 code used for every monetary amount recorded for this clinic. */
  currency: string;
  /** Opening pattern the appointment calendar is built and validated against. */
  schedule: ClinicScheduleSettings;
  /**
   * Operating configuration owned by the Clinic Settings module.
   *
   * Optional at the type level because clinics created before settings existed
   * have no stored subdocument; readers fall back to
   * `DEFAULT_CLINIC_SETTINGS` rather than assuming it is present.
   */
  settings?: ClinicSettings;
  status: ClinicStatus;
  createdBy: Types.ObjectId;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ClinicRecord = ClinicAttributes & { _id: Types.ObjectId };

export interface CreateClinicInput {
  name: string;
  slug: string;
  createdBy: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: Partial<ClinicAddress>;
  timezone?: string;
  currency?: string;
}

export interface UpdateClinicInput {
  name?: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: Partial<ClinicAddress>;
  timezone?: string;
  currency?: string;
  schedule?: ClinicScheduleSettings;
}

export interface ClinicDto {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  address: ClinicAddress;
  timezone: string;
  currency: string;
  schedule: ClinicScheduleSettings;
  status: ClinicStatus;
  createdAt: string;
  updatedAt: string;
}

import type { Types } from 'mongoose';

/**
 * A kind of visit the clinic offers, with the duration it normally takes.
 *
 * This is what makes the diary usable: a secretary picks "Monthly control" and
 * the end time follows from the clinic's own definition, instead of everyone
 * guessing 30 minutes for everything.
 *
 * Types are per-clinic data, never hard-coded in the frontend — two practices
 * disagree about how long a bracket repair takes, and both are right.
 */
export interface AppointmentTypeAttributes {
  /** Tenant key. Present in every single query against this collection. */
  clinicId: Types.ObjectId;
  name: string;
  /** Default length of the visit; the booking form starts from this. */
  durationMinutes: number;
  /** Optional subtle accent on the calendar. Never the only status signal. */
  color: string | null;
  description: string | null;
  /** Retired types stay readable on historical appointments. */
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AppointmentTypeRecord = AppointmentTypeAttributes & { _id: Types.ObjectId };

export interface CreateAppointmentTypeInput {
  clinicId: string;
  createdBy: string;
  name: string;
  durationMinutes: number;
  color?: string | null;
  description?: string | null;
}

export interface UpdateAppointmentTypeInput {
  name?: string;
  durationMinutes?: number;
  color?: string | null;
  description?: string | null;
  isActive?: boolean;
}

export interface AppointmentTypeListFilters {
  /** Omit to list every type; the booking form only wants the active ones. */
  isActive?: boolean;
}

export interface AppointmentTypeDto {
  id: string;
  clinicId: string;
  name: string;
  durationMinutes: number;
  color: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Starter set for a new orthodontic clinic.
 *
 * Seeded once at clinic creation so the diary is usable on day one; every entry
 * is then editable, renameable and retirable by the clinic. Nothing in the code
 * branches on these names.
 */
export const DEFAULT_APPOINTMENT_TYPES: ReadonlyArray<{
  name: string;
  durationMinutes: number;
  color: string;
  description: string;
}> = [
  {
    name: 'First consultation',
    durationMinutes: 40,
    color: '#24564D',
    description: 'Initial assessment, records and treatment discussion.',
  },
  {
    name: 'Monthly control',
    durationMinutes: 15,
    color: '#2D765F',
    description: 'Routine adjustment and progress check.',
  },
  {
    name: 'Wire adjustment',
    durationMinutes: 20,
    color: '#3F6574',
    description: 'Archwire change or activation.',
  },
  {
    name: 'Bracket repair',
    durationMinutes: 20,
    color: '#A66719',
    description: 'Re-bond a loose or detached bracket.',
  },
  {
    name: 'Appliance fitting',
    durationMinutes: 60,
    color: '#C86445',
    description: 'Bonding or fitting a new appliance.',
  },
  {
    name: 'Impression / scan',
    durationMinutes: 30,
    color: '#56635F',
    description: 'Intraoral scan or impressions for the laboratory.',
  },
  {
    name: 'Appliance removal',
    durationMinutes: 45,
    color: '#173F38',
    description: 'Debonding and retention handover.',
  },
  {
    name: 'Emergency',
    durationMinutes: 20,
    color: '#A33D3D',
    description: 'Unscheduled discomfort or breakage.',
  },
];

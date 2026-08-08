import { Types } from 'mongoose';
import { vi } from 'vitest';
import {
  CLINIC_ROLES,
  MEMBERSHIP_STATUSES,
  PLATFORM_ROLES,
  type ClinicRole,
  type MembershipStatus,
  type PlatformRole,
} from '../../src/common/constants/roles.js';
import { CLINIC_STATUSES, type ClinicStatus } from '../../src/modules/clinics/clinic.types.js';

/**
 * In-memory stand-ins for the Mongoose repositories.
 *
 * IMPORTANT: this module must never import `src/app.ts` (directly or through a
 * helper). `vi.mock` factories import it, so pulling the application in here
 * would make the app wait on a mock that is waiting on the app.
 */

export const USER_ID = '652f1c9b8a1e4f0012ab0001';
export const SESSION_ID = '652f1c9b8a1e4f0012ab0002';
export const CLINIC_A = '652f1c9b8a1e4f0012ab34cd';
export const CLINIC_B = '652f1c9b8a1e4f0012ab99ff';
export const PATIENT_ID = '652f1c9b8a1e4f0012abaaaa';

/** Knobs each test turns to describe the caller and their clinic. */
export const testState = {
  platformRole: PLATFORM_ROLES.USER as PlatformRole,
  membershipRole: CLINIC_ROLES.CLINIC_OWNER as ClinicRole,
  membershipStatus: MEMBERSHIP_STATUSES.ACTIVE as MembershipStatus,
  membershipClinicIds: [CLINIC_A] as string[],
  clinicStatus: CLINIC_STATUSES.ACTIVE as ClinicStatus,
  sessionUsable: true,
  emailVerified: true,
};

export function resetTestState(): void {
  testState.platformRole = PLATFORM_ROLES.USER;
  testState.membershipRole = CLINIC_ROLES.CLINIC_OWNER;
  testState.membershipStatus = MEMBERSHIP_STATUSES.ACTIVE;
  testState.membershipClinicIds = [CLINIC_A];
  testState.clinicStatus = CLINIC_STATUSES.ACTIVE;
  testState.sessionUsable = true;
  testState.emailVerified = true;
}

const FIXED_DATE = new Date('2026-01-01T09:00:00.000Z');

function clinicRecord(clinicId: string) {
  return {
    _id: new Types.ObjectId(clinicId),
    name: 'Cabinet Al Amal',
    slug: 'cabinet-al-amal',
    legalName: null,
    email: null,
    phone: null,
    address: { line1: null, line2: null, city: null, postalCode: null, country: null },
    timezone: 'Africa/Tunis',
    currency: 'TND',
    status: testState.clinicStatus,
    createdBy: new Types.ObjectId(USER_ID),
    archivedAt: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
}

export function patientRecord(clinicId: string, patientId = PATIENT_ID) {
  return {
    _id: new Types.ObjectId(patientId),
    clinicId: new Types.ObjectId(clinicId),
    firstName: 'Yasmine',
    lastName: 'Trabelsi',
    birthDate: new Date('2014-03-21T00:00:00.000Z'),
    gender: 'FEMALE' as const,
    phone: '+216 20 123 456',
    email: null,
    address: { line1: null, city: null, postalCode: null, country: null },
    status: 'ACTIVE' as const,
    notes: null,
    createdBy: new Types.ObjectId(USER_ID),
    archivedAt: null,
    archivedBy: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
}

export const userRepositoryMock = {
  findById: vi.fn(async (userId: string) => ({
    _id: new Types.ObjectId(userId),
    email: 'amine@clinic.tn',
    firstName: 'Amine',
    lastName: 'Ben Salah',
    phone: null,
    platformRole: testState.platformRole,
    status: 'ACTIVE' as const,
    emailVerifiedAt: testState.emailVerified ? FIXED_DATE : null,
    lastLoginAt: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  })),
  findByEmail: vi.fn(async () => null),
  findByEmailForAuthentication: vi.fn(async () => null),
  create: vi.fn(),
  markLoggedIn: vi.fn(async () => undefined),
  updatePasswordHash: vi.fn(async () => undefined),
  markEmailVerified: vi.fn(async () => undefined),
  isEmpty: vi.fn(async () => false),
  findManyByIds: vi.fn(async () => []),
};

export const authSessionRepositoryMock = {
  create: vi.fn(),
  findById: vi.fn(async () => null),
  revokeIfActive: vi.fn(async () => null),
  revokeFamily: vi.fn(async () => 0),
  revokeAllForUser: vi.fn(async () => 0),
  isSessionUsable: vi.fn(async () => testState.sessionUsable),
};

export const membershipRepositoryMock = {
  findActiveByUser: vi.fn(async () =>
    testState.membershipStatus === MEMBERSHIP_STATUSES.ACTIVE
      ? testState.membershipClinicIds.map((clinicId) => ({
          _id: new Types.ObjectId(),
          userId: new Types.ObjectId(USER_ID),
          clinicId: new Types.ObjectId(clinicId),
          role: testState.membershipRole,
          status: testState.membershipStatus,
          invitedBy: null,
          joinedAt: FIXED_DATE,
          removedAt: null,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        }))
      : [],
  ),
  findByUserAndClinic: vi.fn(async () => null),
  findByIdInClinic: vi.fn(async () => null),
  listByClinic: vi.fn(async () => ({ items: [], total: 0 })),
  create: vi.fn(),
  update: vi.fn(async () => null),
  countActiveOwners: vi.fn(async () => 2),
};

export const clinicRepositoryMock = {
  findById: vi.fn(async (clinicId: string) => clinicRecord(clinicId)),
  findManyByIds: vi.fn(async (clinicIds: string[]) => clinicIds.map(clinicRecord)),
  existsBySlug: vi.fn(async () => false),
  create: vi.fn(),
  update: vi.fn(async () => null),
};

export const patientRepositoryMock = {
  findByIdInClinic: vi.fn(async (patientId: string, clinicId: string) =>
    patientRecord(clinicId, patientId),
  ),
  listByClinic: vi.fn(async (clinicId: string) => ({
    items: [patientRecord(clinicId)],
    total: 1,
  })),
  create: vi.fn(async (input: { clinicId: string }) => patientRecord(input.clinicId)),
  update: vi.fn(async (patientId: string, clinicId: string) => patientRecord(clinicId, patientId)),
  archive: vi.fn(async (patientId: string, clinicId: string) => patientRecord(clinicId, patientId)),
  restore: vi.fn(async (patientId: string, clinicId: string) => patientRecord(clinicId, patientId)),
};

export const auditLogRepositoryMock = {
  create: vi.fn(async () => ({
    _id: new Types.ObjectId(),
    clinicId: null,
    actorUserId: null,
    action: 'patient.created' as const,
    resourceType: 'patient' as const,
    resourceId: null,
    metadata: {},
    ip: null,
    userAgent: null,
    createdAt: FIXED_DATE,
  })),
  listByClinic: vi.fn(async () => ({ items: [], total: 0 })),
};

export function resetRepositoryMocks(): void {
  const repositories = [
    userRepositoryMock,
    authSessionRepositoryMock,
    membershipRepositoryMock,
    clinicRepositoryMock,
    patientRepositoryMock,
    auditLogRepositoryMock,
  ];

  for (const repository of repositories) {
    for (const value of Object.values(repository)) {
      if (typeof value === 'function' && 'mockClear' in value) {
        (value as { mockClear: () => void }).mockClear();
      }
    }
  }
}

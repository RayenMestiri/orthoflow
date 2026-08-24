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
import type { AppointmentRecord } from '../../src/modules/appointments/appointment.types.js';
import type { ClinicalVisitRecord } from '../../src/modules/clinical-visits/clinical-visit.types.js';
import type { TaskAttributes, TaskRecord } from '../../src/modules/tasks/task.types.js';

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
export const GUARDIAN_ID = '652f1c9b8a1e4f0012abbbbb';

/** Knobs each test turns to describe the caller and their clinic. */
export const testState = {
  activeUserId: USER_ID,
  platformRole: PLATFORM_ROLES.USER as PlatformRole,
  membershipRole: CLINIC_ROLES.CLINIC_OWNER as ClinicRole,
  membershipStatus: MEMBERSHIP_STATUSES.ACTIVE as MembershipStatus,
  membershipClinicIds: [CLINIC_A] as string[],
  clinicStatus: CLINIC_STATUSES.ACTIVE as ClinicStatus,
  sessionUsable: true,
  emailVerified: true,
};

export function resetTestState(): void {
  testState.activeUserId = USER_ID;
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
    referenceNumber: 'PT-0012',
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

export function guardianRecord(clinicId: string, guardianId = GUARDIAN_ID) {
  return {
    _id: new Types.ObjectId(guardianId),
    clinicId: new Types.ObjectId(clinicId),
    firstName: 'Leila',
    lastName: 'Trabelsi',
    phone: '+216 20 100 200',
    email: 'leila@example.com',
    createdBy: new Types.ObjectId(USER_ID),
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
}

export function patientGuardianRecord(clinicId: string) {
  return {
    _id: new Types.ObjectId(),
    clinicId: new Types.ObjectId(clinicId),
    patientId: new Types.ObjectId(PATIENT_ID),
    guardianId: new Types.ObjectId(GUARDIAN_ID),
    relationship: 'MOTHER' as const,
    isPrimary: true,
    financiallyResponsible: true,
    contactPreference: 'PHONE' as const,
    createdBy: new Types.ObjectId(USER_ID),
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
  findManyByIds: vi.fn(async (ids: string[]) =>
    ids.map((id) => ({
      id,
      _id: new Types.ObjectId(id),
      email: 'amine@clinic.tn',
      firstName: 'Amine',
      lastName: 'Ben Salah',
      phone: null,
      platformRole: testState.platformRole,
      status: 'ACTIVE' as const,
      emailVerifiedAt: FIXED_DATE,
      lastLoginAt: null,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    })),
  ),
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
  findByUserAndClinic: vi.fn(async (userId: string, clinicId: string) => ({
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(userId),
    clinicId: new Types.ObjectId(clinicId),
    role: testState.membershipRole,
    status: testState.membershipStatus,
    invitedBy: null,
    joinedAt: FIXED_DATE,
    removedAt: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  })),
  findManyByUsersInClinic: vi.fn(async (userIds: string[], clinicId: string) =>
    userIds.map((uid) => ({
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(uid),
      clinicId: new Types.ObjectId(clinicId),
      role: testState.membershipRole,
      status: testState.membershipStatus,
      invitedBy: null,
      joinedAt: FIXED_DATE,
      removedAt: null,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    })),
  ),
  findByIdInClinic: vi.fn(async () => null),
  listByClinic: vi.fn(async () => ({ items: [], total: 0 })),
  create: vi.fn(),
  update: vi.fn(async () => null),
  countActiveOwners: vi.fn(async () => 2),
  findActiveOwner: vi.fn(async (clinicId: string) => ({
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(USER_ID),
    clinicId: new Types.ObjectId(clinicId),
    role: CLINIC_ROLES.CLINIC_OWNER,
    status: MEMBERSHIP_STATUSES.ACTIVE,
    invitedBy: null,
    joinedAt: FIXED_DATE,
    removedAt: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  })),
};

export const clinicRepositoryMock = {
  findById: vi.fn(async (clinicId: string) => clinicRecord(clinicId)),
  isActiveClinic: vi.fn(async () => testState.clinicStatus === CLINIC_STATUSES.ACTIVE),
  findManyByIds: vi.fn(async (clinicIds: string[]) => clinicIds.map(clinicRecord)),
  existsBySlug: vi.fn(async () => false),
  create: vi.fn(),
  update: vi.fn(async () => null),
};

export const patientRepositoryMock = {
  findByIdInClinic: vi.fn(
    async (patientId: string, clinicId: string): Promise<ReturnType<typeof patientRecord> | null> =>
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
  findManyByIdsInClinic: vi.fn(async (patientIds: string[], clinicId: string) =>
    patientIds.map((patientId) => patientRecord(clinicId, patientId)),
  ),
};

export const APPOINTMENT_ID = '652f1c9b8a1e4f0012abdddd';
export const APPOINTMENT_TYPE_ID = '652f1c9b8a1e4f0012abeeee';

export function appointmentTypeRecord(clinicId: string, typeId = APPOINTMENT_TYPE_ID) {
  return {
    _id: new Types.ObjectId(typeId),
    clinicId: new Types.ObjectId(clinicId),
    name: 'Monthly control',
    durationMinutes: 15,
    color: '#2D765F',
    description: null,
    isActive: true,
    createdBy: new Types.ObjectId(USER_ID),
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
}

/** Monday 2026-08-10, 09:00 in Africa/Tunis (UTC+1). */
export const APPOINTMENT_START = new Date('2026-08-10T08:00:00.000Z');

export function appointmentRecord(
  clinicId: string,
  appointmentId = APPOINTMENT_ID,
): AppointmentRecord {
  return {
    _id: new Types.ObjectId(appointmentId),
    clinicId: new Types.ObjectId(clinicId),
    patientId: new Types.ObjectId(PATIENT_ID),
    treatmentId: null,
    retentionPlanId: null,
    doctorId: new Types.ObjectId(USER_ID),
    appointmentTypeId: new Types.ObjectId(APPOINTMENT_TYPE_ID),
    startAt: APPOINTMENT_START,
    endAt: new Date(APPOINTMENT_START.getTime() + 15 * 60_000),
    durationMinutes: 15,
    status: 'SCHEDULED' as const,
    note: null,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    arrivedAt: null,
    waitingAt: null,
    treatmentStartedAt: null,
    completedAt: null,
    noShowAt: null,
    markedNoShowBy: null,
    overbookingOverride: false,
    overbookingApprovedBy: null,
    createdBy: new Types.ObjectId(USER_ID),
    updatedBy: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
}

export const appointmentRepositoryMock = {
  findByIdInClinic: vi.fn(
    async (appointmentId: string, clinicId: string): Promise<AppointmentRecord | null> =>
      appointmentRecord(clinicId, appointmentId),
  ),
  listInRange: vi.fn(async (clinicId: string) => [appointmentRecord(clinicId)]),
  listCapacityOverlaps: vi.fn(async () => []),
  create: vi.fn(async (input: { clinicId: string }) => appointmentRecord(input.clinicId)),
  updateFields: vi.fn(async (appointmentId: string, clinicId: string) =>
    appointmentRecord(clinicId, appointmentId),
  ),
  transitionStatus: vi.fn(
    async (
      appointmentId: string,
      clinicId: string,
      _fromStatus: string,
      toStatus: string,
      _updatedBy: string,
      cancellation?: { reason: string | null },
    ) => ({
      ...appointmentRecord(clinicId, appointmentId),
      status: toStatus as never,
      ...(cancellation ? { cancellationReason: cancellation.reason, cancelledAt: FIXED_DATE } : {}),
    }),
  ),
  countInRange: vi.fn(async () => 1),
};

export const appointmentTypeRepositoryMock = {
  listByClinic: vi.fn(async (clinicId: string) => [appointmentTypeRecord(clinicId)]),
  findByIdInClinic: vi.fn(async (typeId: string, clinicId: string) =>
    appointmentTypeRecord(clinicId, typeId),
  ),
  findManyByIdsInClinic: vi.fn(async (typeIds: string[], clinicId: string) =>
    typeIds.map((typeId) => appointmentTypeRecord(clinicId, typeId)),
  ),
  create: vi.fn(async (input: { clinicId: string }) => appointmentTypeRecord(input.clinicId)),
  createMany: vi.fn(async () => []),
  update: vi.fn(async (typeId: string, clinicId: string) =>
    appointmentTypeRecord(clinicId, typeId),
  ),
  countForClinic: vi.fn(async () => 1),
};

export const guardianRepositoryMock = {
  create: vi.fn(async (clinicId: string) => guardianRecord(clinicId)),
  findManyByIdsInClinic: vi.fn(async (_guardianIds: string[], clinicId: string) => [
    guardianRecord(clinicId),
  ]),
  findByIdInClinic: vi.fn(async (guardianId: string, clinicId: string) =>
    guardianRecord(clinicId, guardianId),
  ),
  searchInClinic: vi.fn(async (clinicId: string) => [guardianRecord(clinicId)]),
  updateInClinic: vi.fn(async (_guardianId: string, clinicId: string) => guardianRecord(clinicId)),
};

export const patientGuardianRepositoryMock = {
  listByPatient: vi.fn(async (_patientId: string, clinicId: string) => [
    patientGuardianRecord(clinicId),
  ]),
  listPrimaryByPatientIds: vi.fn(async (_patientIds: string[], clinicId: string) => [
    patientGuardianRecord(clinicId),
  ]),
  findByPatientAndGuardian: vi.fn(
    async (
      _patientId: string,
      _guardianId: string,
      clinicId: string,
    ): Promise<ReturnType<typeof patientGuardianRecord> | null> => patientGuardianRecord(clinicId),
  ),
  create: vi.fn(async (input: { clinicId: string }) => patientGuardianRecord(input.clinicId)),
  clearPrimary: vi.fn(async () => undefined),
  update: vi.fn(async (_patientId: string, _guardianId: string, clinicId: string) =>
    patientGuardianRecord(clinicId),
  ),
  unlink: vi.fn(async () => true),
  listSiblingsByGuardian: vi.fn(async (_guardianId: string, clinicId: string) => [
    patientGuardianRecord(clinicId),
  ]),
  countByGuardianInClinic: vi.fn(async () => 1),
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

export const TREATMENT_ID = '652f1c9b8a1e4f0012abffff';
export const VISIT_ID = '652f1c9b8a1e4f0012abeeee';

export function treatmentRecord(clinicId: string, treatmentId = TREATMENT_ID) {
  return {
    _id: new Types.ObjectId(treatmentId),
    clinicId: new Types.ObjectId(clinicId),
    patientId: new Types.ObjectId(PATIENT_ID),
    doctorId: new Types.ObjectId(USER_ID),
    type: 'METAL_BRACES' as const,
    customTypeLabel: null,
    status: 'PLANNED' as const,
    startDate: null,
    expectedEndDate: null,
    completedAt: null,
    agreedPrice: null,
    notes: null,
    cancellationReason: null,
    createdBy: new Types.ObjectId(USER_ID),
    updatedBy: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
}

export const treatmentRepositoryMock = {
  findByIdInClinic: vi.fn(async (treatmentId: string, clinicId: string) =>
    treatmentRecord(clinicId, treatmentId),
  ),
  listByPatient: vi.fn(async (_patientId: string, clinicId: string) => [treatmentRecord(clinicId)]),
  /** No active course by default, so activation is allowed unless a test says otherwise. */
  findActiveForPatient: vi.fn(async () => null),
  create: vi.fn(async (input: { clinicId: string; type: string; status?: string }) => ({
    ...treatmentRecord(input.clinicId),
    type: input.type as never,
    status: (input.status ?? 'PLANNED') as never,
  })),
  update: vi.fn(async (treatmentId: string, clinicId: string) =>
    treatmentRecord(clinicId, treatmentId),
  ),
  changeStatus: vi.fn(
    async (
      treatmentId: string,
      clinicId: string,
      _expectedFrom: string,
      changes: { status: string },
    ) => ({ ...treatmentRecord(clinicId, treatmentId), status: changes.status as never }),
  ),
  createMilestone: vi.fn(
    async (input: { clinicId: string; treatmentId: string; type: string; title: string }) => ({
      _id: new Types.ObjectId(),
      clinicId: new Types.ObjectId(input.clinicId),
      patientId: new Types.ObjectId(PATIENT_ID),
      treatmentId: new Types.ObjectId(input.treatmentId),
      occurredAt: FIXED_DATE,
      type: input.type as never,
      title: input.title,
      description: null,
      createdBy: new Types.ObjectId(USER_ID),
      updatedBy: null,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    }),
  ),
  findMilestoneInTreatment: vi.fn(async () => null),
  updateMilestone: vi.fn(async () => null),
  listMilestonesByTreatment: vi.fn(async () => ({ items: [], total: 0 })),
  listMilestonesByTreatmentIds: vi.fn(async () => []),
};

export function clinicalVisitRecord(clinicId: string, visitId = VISIT_ID): ClinicalVisitRecord {
  return {
    _id: new Types.ObjectId(visitId),
    clinicId: new Types.ObjectId(clinicId),
    patientId: new Types.ObjectId(PATIENT_ID),
    appointmentId: new Types.ObjectId(APPOINTMENT_ID),
    treatmentId: null,
    status: 'DRAFT' as const,
    reasonCode: null,
    reasonOther: null,
    observations: null,
    procedures: [] as never[],
    procedureDetails: null,
    patientInstructions: null,
    doctorNote: null,
    nextVisitRecommendedAt: null,
    nextStepNote: null,
    startedAt: FIXED_DATE,
    completedAt: null,
    createdBy: new Types.ObjectId(USER_ID),
    updatedBy: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
}

export const clinicalVisitRepositoryMock = {
  findByIdInClinic: vi.fn(
    async (visitId: string, clinicId: string): Promise<ClinicalVisitRecord | null> =>
      clinicalVisitRecord(clinicId, visitId),
  ),
  findByAppointment: vi.fn(async (): Promise<ClinicalVisitRecord | null> => null),
  findPreviousCompleted: vi.fn(async (): Promise<ClinicalVisitRecord | null> => null),
  listByPatient: vi.fn(async (): Promise<{ items: ClinicalVisitRecord[]; total: number }> => ({
    items: [],
    total: 0,
  })),
  create: vi.fn(async (input: { clinicId: string }) => clinicalVisitRecord(input.clinicId)),
  update: vi.fn(async (visitId: string, clinicId: string) =>
    clinicalVisitRecord(clinicId, visitId),
  ),
  complete: vi.fn(async (visitId: string, clinicId: string) => ({
    ...clinicalVisitRecord(clinicId, visitId),
    status: 'COMPLETED' as const,
  })),
};

export const patientActivityRepositoryMock = {
  fetchDomainRecords: vi.fn(async () => ({
    appointments: [],
    visits: [],
    treatments: [],
    cashRecords: [],
    media: [],
  })),
  loadContext: vi.fn(async () => ({
    appointmentTypes: new Map(),
    treatments: new Map(),
    receipts: new Map(),
    users: new Map(),
    memberships: new Map(),
  })),
};

export const taskRepositoryMock = {
  create: vi.fn(
    async (
      data: Partial<TaskAttributes> &
        Pick<TaskAttributes, 'clinicId' | 'title' | 'assignedToUserId' | 'createdByUserId'>,
    ): Promise<TaskRecord> => ({
      _id: new Types.ObjectId(),
      clinicId: data.clinicId,
      title: data.title,
      description: data.description ?? null,
      status: data.status ?? 'TODO',
      priority: data.priority ?? 'NORMAL',
      assignedToUserId: data.assignedToUserId,
      createdByUserId: data.createdByUserId,
      dueAt: data.dueAt ?? null,
      startedAt: null,
      completedAt: null,
      completedByUserId: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      context: data.context ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  ),
  findById: vi.fn(async (): Promise<TaskRecord | null> => null),
  list: vi.fn(async (): Promise<{ items: TaskRecord[]; total: number }> => ({
    items: [],
    total: 0,
  })),
  getSummary: vi.fn(async () => ({
    toDo: 0,
    inProgress: 0,
    overdue: 0,
    urgent: 0,
    completedToday: 0,
  })),
  countOpenByPatient: vi.fn(async () => 0),
  update: vi.fn(async (): Promise<TaskRecord | null> => null),
};

export function resetRepositoryMocks(): void {
  const repositories = [
    userRepositoryMock,
    authSessionRepositoryMock,
    membershipRepositoryMock,
    clinicRepositoryMock,
    patientRepositoryMock,
    guardianRepositoryMock,
    patientGuardianRepositoryMock,
    appointmentRepositoryMock,
    appointmentTypeRepositoryMock,
    treatmentRepositoryMock,
    clinicalVisitRepositoryMock,
    patientActivityRepositoryMock,
    taskRepositoryMock,
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

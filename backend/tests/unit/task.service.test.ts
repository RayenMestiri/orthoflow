import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES, MEMBERSHIP_STATUSES } from '../../src/common/constants/roles.js';
import { BusinessRuleError, ValidationError } from '../../src/common/errors/index.js';
import { TaskService } from '../../src/modules/tasks/task.service.js';
import type { TaskRecord } from '../../src/modules/tasks/task.types.js';
import type { TaskRepository } from '../../src/modules/tasks/task.repository.js';
import type { MembershipRepository } from '../../src/modules/memberships/membership.repository.js';
import type { UserRepository } from '../../src/modules/users/user.repository.js';
import type { PatientRepository } from '../../src/modules/patients/patient.repository.js';
import type { AuditLogService } from '../../src/modules/audit-logs/audit-log.service.js';
import type { CommunicationEventService } from '../../src/modules/notifications/notification.service.js';

const CLINIC_ID = '652f1c9b8a1e4f0012ab34cd';
const DOCTOR_ID = '652f1c9b8a1e4f0012ab0001';
const SECRETARY_ID = '652f1c9b8a1e4f0012ab0002';
const PATIENT_ID = '652f1c9b8a1e4f0012abaaaa';

describe('TaskService', () => {
  type MockFn = ReturnType<typeof vi.fn>;
  let taskRepo: {
    create: MockFn;
    findById: MockFn;
    list: MockFn;
    getSummary: MockFn;
    update: MockFn;
  };
  let membershipRepo: { findByUserAndClinic: MockFn; findManyByUsersInClinic: MockFn };
  let userRepo: { findById: MockFn; findManyByIds: MockFn };
  let patientRepo: { findByIdInClinic: MockFn; findManyByIdsInClinic: MockFn };
  let auditLogs: { record: MockFn };
  let communicationEvents: { enqueue: MockFn };
  let service: TaskService;

  beforeEach(() => {
    taskRepo = {
      create: vi.fn(async (data: Partial<TaskRecord>) => ({
        _id: new Types.ObjectId('652f1c9b8a1e4f0012ab9999'),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findById: vi.fn(),
      list: vi.fn(async () => ({ items: [], total: 0 })),
      getSummary: vi.fn(async () => ({
        toDo: 0,
        inProgress: 0,
        overdue: 0,
        urgent: 0,
        completedToday: 0,
      })),
      update: vi.fn(),
    };

    membershipRepo = {
      findByUserAndClinic: vi.fn(async (userId: string, clinicId: string) => ({
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(userId),
        clinicId: new Types.ObjectId(clinicId),
        role: userId === DOCTOR_ID ? CLINIC_ROLES.CLINIC_OWNER : CLINIC_ROLES.SECRETARY,
        status: MEMBERSHIP_STATUSES.ACTIVE,
      })),
      findManyByUsersInClinic: vi.fn(async (userIds: string[]) =>
        userIds.map((uid) => ({
          _id: new Types.ObjectId(),
          userId: new Types.ObjectId(uid),
          clinicId: new Types.ObjectId(CLINIC_ID),
          role: uid === DOCTOR_ID ? CLINIC_ROLES.CLINIC_OWNER : CLINIC_ROLES.SECRETARY,
          status: MEMBERSHIP_STATUSES.ACTIVE,
        })),
      ),
    };

    userRepo = {
      findById: vi.fn(async (id: string) => ({
        _id: new Types.ObjectId(id),
        firstName: id === DOCTOR_ID ? 'Rayen' : 'Sarah',
        lastName: id === DOCTOR_ID ? 'Mestiri' : 'Trabelsi',
      })),
      findManyByIds: vi.fn(async (ids: string[]) =>
        ids.map((id) => ({
          id,
          _id: new Types.ObjectId(id),
          firstName: id === DOCTOR_ID ? 'Rayen' : 'Sarah',
          lastName: id === DOCTOR_ID ? 'Mestiri' : 'Trabelsi',
          email: `${id}@test.com`,
        })),
      ),
    };

    patientRepo = {
      findByIdInClinic: vi.fn(async (pId: string, _cId: string) => ({
        id: pId,
        _id: new Types.ObjectId(pId),
        firstName: 'Mariem',
        lastName: 'Bouazizi',
        referenceNumber: 'PAT-0042',
      })),
      findManyByIdsInClinic: vi.fn(async (ids: string[], _cId: string) =>
        ids.map((id) => ({
          id,
          _id: new Types.ObjectId(id),
          firstName: 'Mariem',
          lastName: 'Bouazizi',
          referenceNumber: 'PAT-0042',
        })),
      ),
    };

    auditLogs = {
      record: vi.fn().mockResolvedValue(undefined),
    };
    communicationEvents = { enqueue: vi.fn().mockResolvedValue(undefined) };

    service = new TaskService(
      taskRepo as unknown as TaskRepository,
      membershipRepo as unknown as MembershipRepository,
      userRepo as unknown as UserRepository,
      patientRepo as unknown as PatientRepository,
      auditLogs as unknown as AuditLogService,
      communicationEvents as unknown as CommunicationEventService,
    );
  });

  it('creates a task for an active clinic staff member with patient context', async () => {
    const res = await service.create(CLINIC_ID, DOCTOR_ID, {
      title: 'Appeler le père de Mariem',
      description: 'Confirmer le prochain rendez-vous',
      priority: 'HIGH',
      assignedToUserId: SECRETARY_ID,
      dueAt: new Date('2026-08-25T16:00:00.000Z'),
      context: {
        type: 'PATIENT',
        entityId: PATIENT_ID,
        patientId: PATIENT_ID,
      },
    });

    expect(taskRepo.create).toHaveBeenCalled();
    expect(res.title).toBe('Appeler le père de Mariem');
    expect(res.priority).toBe('HIGH');
    expect(res.assignedTo.displayName).toBe('Sarah Trabelsi');
    expect(res.createdBy.displayName).toBe('Rayen Mestiri');
    expect(res.patient?.fullName).toBe('Mariem Bouazizi');
    expect(auditLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.created' }),
    );
  });

  it('rejects task assignment to a user outside the clinic', async () => {
    membershipRepo.findByUserAndClinic.mockResolvedValueOnce(null);

    await expect(
      service.create(CLINIC_ID, DOCTOR_ID, {
        title: 'Task outside clinic',
        assignedToUserId: '652f1c9b8a1e4f0012ab9999',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('transitions task through lifecycle: start -> complete', async () => {
    const initialRecord: TaskRecord = {
      _id: new Types.ObjectId('652f1c9b8a1e4f0012ab9999'),
      clinicId: new Types.ObjectId(CLINIC_ID),
      title: 'Vérifier la radio',
      description: null,
      status: 'TODO',
      priority: 'NORMAL',
      assignedToUserId: new Types.ObjectId(DOCTOR_ID),
      createdByUserId: new Types.ObjectId(SECRETARY_ID),
      dueAt: null,
      startedAt: null,
      completedAt: null,
      completedByUserId: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      context: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    taskRepo.findById.mockResolvedValue(initialRecord);
    taskRepo.update.mockImplementation(
      (_cId: string, _tId: string, patch: Partial<TaskRecord>) => ({
        ...initialRecord,
        ...patch,
      }),
    );

    // 1. Start task
    const started = await service.start(CLINIC_ID, DOCTOR_ID, '652f1c9b8a1e4f0012ab9999');
    expect(started.status).toBe('IN_PROGRESS');
    expect(auditLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.started' }),
    );

    // 2. Complete task
    const completed = await service.complete(CLINIC_ID, DOCTOR_ID, '652f1c9b8a1e4f0012ab9999', {
      completionNote: 'Radio vérifiée, pas de carie',
    });
    expect(completed.status).toBe('COMPLETED');
    expect(completed.completedBy?.displayName).toBe('Rayen Mestiri');
    expect(auditLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.completed' }),
    );
  });

  it('cancels a task and records the cancellation reason', async () => {
    const initialRecord: TaskRecord = {
      _id: new Types.ObjectId('652f1c9b8a1e4f0012ab9999'),
      clinicId: new Types.ObjectId(CLINIC_ID),
      title: 'Appeler patient',
      description: null,
      status: 'TODO',
      priority: 'NORMAL',
      assignedToUserId: new Types.ObjectId(SECRETARY_ID),
      createdByUserId: new Types.ObjectId(DOCTOR_ID),
      dueAt: null,
      startedAt: null,
      completedAt: null,
      completedByUserId: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      context: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    taskRepo.findById.mockResolvedValue(initialRecord);
    taskRepo.update.mockImplementation(
      (_cId: string, _tId: string, patch: Partial<TaskRecord>) => ({
        ...initialRecord,
        ...patch,
      }),
    );

    const cancelled = await service.cancel(CLINIC_ID, DOCTOR_ID, '652f1c9b8a1e4f0012ab9999', {
      reason: 'Patient a déjà appelé directement',
    });

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancellationReason).toBe('Patient a déjà appelé directement');
    expect(auditLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.cancelled' }),
    );
  });

  it('rejects completion or edit of an already completed task', async () => {
    const completedRecord: TaskRecord = {
      _id: new Types.ObjectId('652f1c9b8a1e4f0012ab9999'),
      clinicId: new Types.ObjectId(CLINIC_ID),
      title: 'Tâche finie',
      status: 'COMPLETED',
      priority: 'NORMAL',
      assignedToUserId: new Types.ObjectId(SECRETARY_ID),
      createdByUserId: new Types.ObjectId(DOCTOR_ID),
      dueAt: null,
      startedAt: new Date(),
      completedAt: new Date(),
      completedByUserId: new Types.ObjectId(SECRETARY_ID),
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      context: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TaskRecord;

    taskRepo.findById.mockResolvedValue(completedRecord);

    await expect(
      service.complete(CLINIC_ID, DOCTOR_ID, '652f1c9b8a1e4f0012ab9999'),
    ).rejects.toThrow(BusinessRuleError);
    await expect(
      service.update(CLINIC_ID, DOCTOR_ID, '652f1c9b8a1e4f0012ab9999', { title: 'Nouveau titre' }),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('dynamically derives isOverdue based on dueAt and current status', async () => {
    const pastDate = new Date('2026-08-20T10:00:00.000Z');
    const futureDate = new Date('2026-08-30T10:00:00.000Z');
    const nowDate = new Date('2026-08-22T14:00:00.000Z');

    const records: TaskRecord[] = [
      {
        _id: new Types.ObjectId('652f1c9b8a1e4f0012ab0001'),
        clinicId: new Types.ObjectId(CLINIC_ID),
        title: 'Overdue task',
        status: 'TODO',
        priority: 'NORMAL',
        assignedToUserId: new Types.ObjectId(SECRETARY_ID),
        createdByUserId: new Types.ObjectId(DOCTOR_ID),
        dueAt: pastDate,
        startedAt: null,
        completedAt: null,
        completedByUserId: null,
        cancelledAt: null,
        cancelledByUserId: null,
        cancellationReason: null,
        context: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as TaskRecord,
      {
        _id: new Types.ObjectId('652f1c9b8a1e4f0012ab0002'),
        clinicId: new Types.ObjectId(CLINIC_ID),
        title: 'Completed task with past due date',
        status: 'COMPLETED',
        priority: 'NORMAL',
        assignedToUserId: new Types.ObjectId(SECRETARY_ID),
        createdByUserId: new Types.ObjectId(DOCTOR_ID),
        dueAt: pastDate,
        startedAt: null,
        completedAt: new Date(),
        completedByUserId: new Types.ObjectId(SECRETARY_ID),
        cancelledAt: null,
        cancelledByUserId: null,
        cancellationReason: null,
        context: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as TaskRecord,
      {
        _id: new Types.ObjectId('652f1c9b8a1e4f0012ab0003'),
        clinicId: new Types.ObjectId(CLINIC_ID),
        title: 'Future task',
        status: 'TODO',
        priority: 'NORMAL',
        assignedToUserId: new Types.ObjectId(SECRETARY_ID),
        createdByUserId: new Types.ObjectId(DOCTOR_ID),
        dueAt: futureDate,
        startedAt: null,
        completedAt: null,
        completedByUserId: null,
        cancelledAt: null,
        cancelledByUserId: null,
        cancellationReason: null,
        context: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as TaskRecord,
    ];

    taskRepo.list.mockResolvedValueOnce({ items: records, total: 3 });

    const listRes = await service.list(
      CLINIC_ID,
      DOCTOR_ID,
      CLINIC_ROLES.CLINIC_OWNER,
      {},
      { page: 1, limit: 20, skip: 0 },
      nowDate,
    );

    expect(listRes.result.items[0]?.isOverdue).toBe(true); // TODO and due in past -> overdue
    expect(listRes.result.items[1]?.isOverdue).toBe(false); // COMPLETED -> never overdue
    expect(listRes.result.items[2]?.isOverdue).toBe(false); // TODO and due in future -> not overdue
  });
});

import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import {
  CLINIC_A,
  PATIENT_ID,
  USER_ID,
  resetRepositoryMocks,
  resetTestState,
  taskRepositoryMock,
  testState,
} from '../helpers/repository-mocks.js';
import { authHeader, createTestApp } from '../helpers/test-app.js';

vi.mock('../../src/modules/users/user.repository.js', async () => ({
  userRepository: (await import('../helpers/repository-mocks.js')).userRepositoryMock,
}));
vi.mock('../../src/modules/auth/auth-session.repository.js', async () => ({
  authSessionRepository: (await import('../helpers/repository-mocks.js')).authSessionRepositoryMock,
}));
vi.mock('../../src/modules/memberships/membership.repository.js', async () => ({
  membershipRepository: (await import('../helpers/repository-mocks.js')).membershipRepositoryMock,
}));
vi.mock('../../src/modules/clinics/clinic.repository.js', async () => ({
  clinicRepository: (await import('../helpers/repository-mocks.js')).clinicRepositoryMock,
}));
vi.mock('../../src/modules/patients/patient.repository.js', async () => ({
  patientRepository: (await import('../helpers/repository-mocks.js')).patientRepositoryMock,
}));
vi.mock('../../src/modules/tasks/task.repository.js', async () => ({
  taskRepository: (await import('../helpers/repository-mocks.js')).taskRepositoryMock,
}));
vi.mock('../../src/modules/audit-logs/audit-log.repository.js', async () => ({
  auditLogRepository: (await import('../helpers/repository-mocks.js')).auditLogRepositoryMock,
}));
vi.mock('../../src/modules/notifications/notification.repository.js', () => ({
  communicationOutboxRepository: { enqueue: vi.fn(async () => undefined) },
  notificationRepository: {},
}));

describe('Tasks API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetTestState();
    resetRepositoryMocks();
  });

  it('returns 401 for an unauthenticated request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks',
    });
    expect(response.statusCode).toBe(401);
  });

  it('creates a new task via POST /api/v1/tasks', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: authHeader(),
      payload: {
        title: 'Appeler le tuteur pour confirmer RDV',
        priority: 'HIGH',
        assignedToUserId: USER_ID,
        dueAt: '2026-08-25T14:00:00.000Z',
        context: {
          type: 'PATIENT',
          entityId: PATIENT_ID,
          patientId: PATIENT_ID,
        },
      },
    });

    if (response.statusCode !== 201) {
      console.error('CREATE ERROR:', JSON.stringify(response.json(), null, 2));
    }
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.title).toBe('Appeler le tuteur pour confirmer RDV');
    expect(body.data.priority).toBe('HIGH');
  });

  it('lists tasks and summary via GET /api/v1/tasks', async () => {
    taskRepositoryMock.list.mockResolvedValueOnce({
      items: [
        {
          _id: new Types.ObjectId(),
          clinicId: new Types.ObjectId(CLINIC_A),
          title: 'Vérifier la radio panoramique',
          description: 'Patient avec douleur canine',
          status: 'TODO',
          priority: 'URGENT',
          assignedToUserId: new Types.ObjectId(USER_ID),
          createdByUserId: new Types.ObjectId(USER_ID),
          dueAt: new Date('2026-08-20T10:00:00.000Z'),
          startedAt: null,
          completedAt: null,
          completedByUserId: null,
          cancelledAt: null,
          cancelledByUserId: null,
          cancellationReason: null,
          context: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      total: 1,
    });

    taskRepositoryMock.getSummary.mockResolvedValueOnce({
      toDo: 1,
      inProgress: 0,
      overdue: 1,
      urgent: 1,
      completedToday: 0,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tasks?scope=MINE&status=ALL',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].title).toBe('Vérifier la radio panoramique');
    expect(body.data[0].isOverdue).toBe(true);
    expect(body.summary.overdue).toBe(1);
    expect(body.summary.urgent).toBe(1);
  });

  it('completes a task via POST /api/v1/tasks/:taskId/complete', async () => {
    const taskId = '652f1c9b8a1e4f0012ab7777';

    taskRepositoryMock.findById.mockResolvedValueOnce({
      _id: new Types.ObjectId(taskId),
      clinicId: new Types.ObjectId(CLINIC_A),
      title: 'Tâche à terminer',
      status: 'TODO',
      priority: 'NORMAL',
      assignedToUserId: new Types.ObjectId(USER_ID),
      createdByUserId: new Types.ObjectId(USER_ID),
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
    });

    taskRepositoryMock.update.mockResolvedValueOnce({
      _id: new Types.ObjectId(taskId),
      clinicId: new Types.ObjectId(CLINIC_A),
      title: 'Tâche à terminer',
      status: 'COMPLETED',
      priority: 'NORMAL',
      assignedToUserId: new Types.ObjectId(USER_ID),
      createdByUserId: new Types.ObjectId(USER_ID),
      dueAt: null,
      startedAt: null,
      completedAt: new Date(),
      completedByUserId: new Types.ObjectId(USER_ID),
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      context: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskId}/complete`,
      headers: authHeader(),
      payload: {
        completionNote: 'Fait avec succès',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.status).toBe('COMPLETED');
  });

  it('cancels a task via POST /api/v1/tasks/:taskId/cancel', async () => {
    const taskId = '652f1c9b8a1e4f0012ab8888';

    taskRepositoryMock.findById.mockResolvedValueOnce({
      _id: new Types.ObjectId(taskId),
      clinicId: new Types.ObjectId(CLINIC_A),
      title: 'Tâche à annuler',
      status: 'TODO',
      priority: 'NORMAL',
      assignedToUserId: new Types.ObjectId(USER_ID),
      createdByUserId: new Types.ObjectId(USER_ID),
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
    });

    taskRepositoryMock.update.mockResolvedValueOnce({
      _id: new Types.ObjectId(taskId),
      clinicId: new Types.ObjectId(CLINIC_A),
      title: 'Tâche à annuler',
      status: 'CANCELLED',
      priority: 'NORMAL',
      assignedToUserId: new Types.ObjectId(USER_ID),
      createdByUserId: new Types.ObjectId(USER_ID),
      dueAt: null,
      startedAt: null,
      completedAt: null,
      completedByUserId: null,
      cancelledAt: new Date(),
      cancelledByUserId: new Types.ObjectId(USER_ID),
      cancellationReason: 'Non nécessaire',
      context: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskId}/cancel`,
      headers: authHeader(),
      payload: {
        reason: 'Non nécessaire',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.status).toBe('CANCELLED');
    expect(body.data.cancellationReason).toBe('Non nécessaire');
  });
});

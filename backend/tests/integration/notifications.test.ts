import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLINIC_A,
  USER_ID,
  resetRepositoryMocks,
  resetTestState,
} from '../helpers/repository-mocks.js';
import { authHeader, createTestApp } from '../helpers/test-app.js';

const serviceMock = vi.hoisted(() => ({
  listForStaff: vi.fn(),
  unreadCount: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));

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
vi.mock('../../src/modules/notifications/notification.service.js', () => ({
  notificationService: serviceMock,
  communicationEventService: { enqueue: vi.fn(async () => undefined) },
}));

const notificationId = new Types.ObjectId().toString();
const notification = {
  id: notificationId,
  type: 'TASK_ASSIGNED',
  priority: 'NORMAL',
  title: 'New task assigned',
  message: 'Review scan',
  context: {
    target: 'TASK',
    patientId: null,
    taskId: new Types.ObjectId().toString(),
    appointmentId: null,
    consentId: null,
    documentId: null,
    treatmentId: null,
    retentionPlanId: null,
  },
  occurredAt: '2026-08-24T09:00:00.000Z',
  readAt: null,
  createdAt: '2026-08-24T09:00:00.000Z',
};

describe('Notifications API', () => {
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
    vi.clearAllMocks();
    serviceMock.listForStaff.mockResolvedValue({
      result: { items: [notification], total: 1 },
      pagination: { page: 1, limit: 20, skip: 0 },
    });
    serviceMock.unreadCount.mockResolvedValue(1);
    serviceMock.markRead.mockResolvedValue({ ...notification, readAt: '2026-08-24T10:00:00.000Z' });
    serviceMock.markAllRead.mockResolvedValue({
      updatedCount: 1,
      readAt: '2026-08-24T10:00:00.000Z',
    });
  });

  it('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/notifications' });
    expect(response.statusCode).toBe(401);
  });

  it('lists only through the authenticated tenant and staff identity', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications?filter=UNREAD&page=1&limit=20',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(serviceMock.listForStaff).toHaveBeenCalledWith(
      CLINIC_A,
      USER_ID,
      { filter: 'UNREAD' },
      expect.objectContaining({ page: 1, limit: 20 }),
    );
    expect(response.json().data[0].id).toBe(notificationId);
  });

  it('counts and marks notifications using the authenticated recipient scope', async () => {
    const count = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/unread-count',
      headers: authHeader(),
    });
    const read = await app.inject({
      method: 'POST',
      url: `/api/v1/notifications/${notificationId}/read`,
      headers: authHeader(),
    });
    const readAll = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/read-all',
      headers: authHeader(),
    });

    expect(count.statusCode).toBe(200);
    expect(read.statusCode).toBe(200);
    expect(readAll.statusCode).toBe(200);
    expect(serviceMock.unreadCount).toHaveBeenCalledWith(CLINIC_A, USER_ID);
    expect(serviceMock.markRead).toHaveBeenCalledWith(CLINIC_A, USER_ID, notificationId);
    expect(serviceMock.markAllRead).toHaveBeenCalledWith(CLINIC_A, USER_ID);
  });
});

import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskDto, TaskSummaryDto } from '../models/task.models';
import { TasksApiService } from './tasks.api';
import { TasksStore } from './tasks.store';

const MOCK_SUMMARY: TaskSummaryDto = {
  toDo: 3,
  inProgress: 1,
  overdue: 1,
  urgent: 1,
  completedToday: 2,
};

const MOCK_TASK: TaskDto = {
  id: 'task-1',
  clinicId: 'clinic-1',
  title: 'Vérifier la radio panoramique',
  description: 'Patient se plaint d’une douleur en 16',
  status: 'TODO',
  priority: 'HIGH',
  isOverdue: false,
  assignedTo: { id: 'user-1', displayName: 'Dr. Martin', role: 'ORTHODONTIST' },
  createdBy: { id: 'user-2', displayName: 'Sophie', role: 'SECRETARY' },
  completedBy: null,
  dueAt: '2026-08-25T18:00:00.000Z',
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  patient: { id: 'patient-1', fullName: 'Rayen Mestiri', referenceNumber: 'PT-0001' },
  context: { type: 'PATIENT', entityId: 'patient-1', patientId: 'patient-1', label: 'Rayen Mestiri' },
  attachments: [],
  createdAt: '2026-08-22T10:00:00.000Z',
  updatedAt: '2026-08-22T10:00:00.000Z',
};

describe('TasksStore', () => {
  let store: TasksStore;
  let api: {
    list: ReturnType<typeof vi.fn>;
    getSummary: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    complete: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      list: vi.fn().mockReturnValue(
        of({
          items: [MOCK_TASK],
          summary: MOCK_SUMMARY,
          pagination: { page: 1, limit: 20, total: 1, pages: 1 },
        }),
      ),
      getSummary: vi.fn().mockReturnValue(of(MOCK_SUMMARY)),
      create: vi.fn().mockReturnValue(of(MOCK_TASK)),
      update: vi.fn().mockReturnValue(of({ ...MOCK_TASK, priority: 'URGENT' })),
      start: vi.fn().mockReturnValue(of({ ...MOCK_TASK, status: 'IN_PROGRESS' })),
      complete: vi.fn().mockReturnValue(of({ ...MOCK_TASK, status: 'COMPLETED' })),
      cancel: vi.fn().mockReturnValue(of({ ...MOCK_TASK, status: 'CANCELLED' })),
    };

    TestBed.configureTestingModule({
      providers: [TasksStore, { provide: TasksApiService, useValue: api }],
    });

    store = TestBed.inject(TasksStore);
  });

  it('loads tasks and populates items and summary state', async () => {
    await store.load({ scope: 'MINE' });

    expect(api.list).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      scope: 'MINE',
      status: 'ACTIVE',
      search: '',
    });
    expect(store.items()).toHaveLength(1);
    expect(store.items()[0]?.title).toBe('Vérifier la radio panoramique');
    expect(store.summary().toDo).toBe(3);
    expect(store.activeCount()).toBe(4);
    expect(store.overdueCount()).toBe(1);
  });

  it('manages create and detail drawer state', () => {
    expect(store.activeDrawer()).toBeNull();

    store.openCreateDrawer({ title: 'Rappeler tuteur' });
    expect(store.activeDrawer()).toBe('CREATE');
    expect(store.drawerPrefill()?.title).toBe('Rappeler tuteur');

    store.closeDrawer();
    expect(store.activeDrawer()).toBeNull();

    store.openDetailDrawer(MOCK_TASK);
    expect(store.activeDrawer()).toBe('DETAIL');
    expect(store.selectedTask()?.id).toBe('task-1');
  });

  it('performs start and complete actions seamlessly', async () => {
    await store.load();
    const started = await store.startTask('task-1');
    expect(started.status).toBe('IN_PROGRESS');
    expect(store.items()[0]?.status).toBe('IN_PROGRESS');

    const completed = await store.completeTask('task-1');
    expect(completed.status).toBe('COMPLETED');
    expect(store.items()[0]?.status).toBe('COMPLETED');
  });
});

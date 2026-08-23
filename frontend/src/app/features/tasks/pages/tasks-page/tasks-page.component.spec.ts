import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionService } from '../../../../core/auth/permissions';
import { TasksApiService } from '../../data-access/tasks.api';
import { TasksStore } from '../../data-access/tasks.store';
import type { TaskDto, TaskSummaryDto } from '../../models/task.models';
import { TasksPageComponent } from './tasks-page.component';

const MOCK_SUMMARY: TaskSummaryDto = {
  toDo: 2,
  inProgress: 1,
  overdue: 1,
  urgent: 1,
  completedToday: 1,
};

const MOCK_TASK: TaskDto = {
  id: 'task-1',
  clinicId: 'clinic-1',
  title: 'Appeler le père pour accord financier',
  description: 'Devis envoyé la semaine dernière',
  status: 'TODO',
  priority: 'URGENT',
  isOverdue: true,
  assignedTo: { id: 'user-1', displayName: 'Sophie Secrétaire', role: 'SECRETARY' },
  createdBy: { id: 'user-2', displayName: 'Dr. Martin', role: 'ORTHODONTIST' },
  completedBy: null,
  dueAt: '2026-08-20T18:00:00.000Z',
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  patient: { id: 'patient-1', fullName: 'Youssef Trabelsi', referenceNumber: 'PT-0089' },
  context: { type: 'PATIENT', entityId: 'patient-1', patientId: 'patient-1', label: 'Youssef Trabelsi' },
  attachments: [],
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
};

describe('TasksPageComponent', () => {
  let fixture: ComponentFixture<TasksPageComponent>;
  let api: {
    list: ReturnType<typeof vi.fn>;
    getSummary: ReturnType<typeof vi.fn>;
    getClinicMembers: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    complete: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      list: vi.fn().mockReturnValue(
        of({
          items: [MOCK_TASK],
          summary: MOCK_SUMMARY,
          pagination: { page: 1, limit: 20, total: 1, pages: 1 },
        }),
      ),
      getSummary: vi.fn().mockReturnValue(of(MOCK_SUMMARY)),
      getClinicMembers: vi.fn().mockReturnValue(of([])),
      create: vi.fn().mockReturnValue(of(MOCK_TASK)),
      update: vi.fn().mockReturnValue(of(MOCK_TASK)),
      start: vi.fn().mockReturnValue(of(MOCK_TASK)),
      complete: vi.fn().mockReturnValue(of(MOCK_TASK)),
      cancel: vi.fn().mockReturnValue(of(MOCK_TASK)),
    };

    await TestBed.configureTestingModule({
      imports: [TasksPageComponent],
      providers: [
        provideRouter([]),
        TasksStore,
        { provide: TasksApiService, useValue: api },
        { provide: PermissionService, useValue: { can: () => true } },
        {
          provide: AuthStore,
          useValue: {
            user: () => ({ id: 'user-1', firstName: 'Sophie', lastName: 'Secrétaire' }),
            activeMembership: () => ({ clinicId: 'clinic-1', role: 'SECRETARY' }),
            memberships: () => [],
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TasksPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders task list cards with priority, overdue indicator and assignee', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Tâches internes');
    expect(el.textContent).toContain('Appeler le père pour accord financier');
    expect(el.textContent).toContain('En retard');
    expect(el.textContent).toContain('Urgente');
    expect(el.textContent).toContain('Sophie Secrétaire');
  });

  it('filters tasks when clicking status pills', async () => {
    const component = fixture.componentInstance;
    component.setStatusFilter('OVERDUE');
    expect(api.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'OVERDUE' }),
    );
  });
});

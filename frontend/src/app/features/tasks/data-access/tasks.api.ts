import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, type Observable, of } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  CancelTaskInput,
  CompleteTaskInput,
  CreateTaskInput,
  TaskDto,
  TaskListFilters,
  TaskPaginationMeta,
  TaskSummaryDto,
  UpdateTaskInput,
} from '../models/task.models';

interface TaskListEnvelope {
  success: true;
  data: TaskDto[];
  summary: TaskSummaryDto;
  pagination: TaskPaginationMeta;
}

interface ClinicMemberSummary {
  id: string;
  userId: string;
  role: string;
  user?: { firstName: string; lastName: string; email: string };
}

@Injectable({ providedIn: 'root' })
export class TasksApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly tasksUrl = `${this.baseUrl}/tasks`;

  list(filters: TaskListFilters = {}): Observable<{
    items: TaskDto[];
    summary: TaskSummaryDto;
    pagination: TaskPaginationMeta;
  }> {
    let params = new HttpParams();

    if (filters.page) params = params.set('page', filters.page);
    if (filters.limit) params = params.set('limit', filters.limit);
    if (filters.scope) params = params.set('scope', filters.scope);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.priority) params = params.set('priority', filters.priority);
    if (filters.assigneeId) params = params.set('assigneeId', filters.assigneeId);
    if (filters.patientId) params = params.set('patientId', filters.patientId);
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());

    return this.http.get<TaskListEnvelope>(this.tasksUrl, { params }).pipe(
      map((res) => ({
        items: res.data,
        summary: res.summary,
        pagination: res.pagination,
      })),
    );
  }

  getSummary(): Observable<TaskSummaryDto> {
    return this.http
      .get<ApiEnvelope<TaskSummaryDto>>(`${this.tasksUrl}/summary`)
      .pipe(map((res) => res.data));
  }

  getById(taskId: string): Observable<TaskDto> {
    return this.http
      .get<ApiEnvelope<TaskDto>>(`${this.tasksUrl}/${taskId}`)
      .pipe(map((res) => res.data));
  }

  create(input: CreateTaskInput): Observable<TaskDto> {
    return this.http.post<ApiEnvelope<TaskDto>>(this.tasksUrl, input).pipe(map((res) => res.data));
  }

  update(taskId: string, input: UpdateTaskInput): Observable<TaskDto> {
    return this.http
      .patch<ApiEnvelope<TaskDto>>(`${this.tasksUrl}/${taskId}`, input)
      .pipe(map((res) => res.data));
  }

  start(taskId: string): Observable<TaskDto> {
    return this.http
      .post<ApiEnvelope<TaskDto>>(`${this.tasksUrl}/${taskId}/start`, {})
      .pipe(map((res) => res.data));
  }

  complete(taskId: string, input: CompleteTaskInput = {}): Observable<TaskDto> {
    return this.http
      .post<ApiEnvelope<TaskDto>>(`${this.tasksUrl}/${taskId}/complete`, input)
      .pipe(map((res) => res.data));
  }

  cancel(taskId: string, input: CancelTaskInput = {}): Observable<TaskDto> {
    return this.http
      .post<ApiEnvelope<TaskDto>>(`${this.tasksUrl}/${taskId}/cancel`, input)
      .pipe(map((res) => res.data));
  }

  getClinicMembers(clinicId: string): Observable<ClinicMemberSummary[]> {
    return this.http
      .get<{ success: true; data: ClinicMemberSummary[] }>(
        `${this.baseUrl}/clinics/${clinicId}/members`,
      )
      .pipe(
        map((res) => res.data),
        catchError(() => of([])),
      );
  }
}

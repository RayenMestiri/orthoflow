import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../core/http/api-error';
import type {
  CancelTaskInput,
  CompleteTaskInput,
  CreateTaskInput,
  TaskDto,
  TaskListFilters,
  TaskSummaryDto,
  UpdateTaskInput,
} from '../models/task.models';
import { TasksApiService } from './tasks.api';

const INITIAL_FILTERS: TaskListFilters = {
  page: 1,
  limit: 20,
  scope: 'MINE',
  status: 'ACTIVE',
  search: '',
};

const INITIAL_SUMMARY: TaskSummaryDto = {
  toDo: 0,
  inProgress: 0,
  overdue: 0,
  urgent: 0,
  completedToday: 0,
};

@Injectable({ providedIn: 'root' })
export class TasksStore {
  private readonly api = inject(TasksApiService);

  private readonly itemsState = signal<TaskDto[]>([]);
  private readonly summaryState = signal<TaskSummaryDto>(INITIAL_SUMMARY);
  private readonly totalState = signal(0);
  private readonly pagesState = signal(1);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly filtersState = signal<TaskListFilters>(INITIAL_FILTERS);

  // Drawer / Selection state
  private readonly selectedTaskState = signal<TaskDto | null>(null);
  private readonly activeDrawerState = signal<'CREATE' | 'DETAIL' | null>(null);
  private readonly drawerPrefillState = signal<Partial<CreateTaskInput> | null>(null);

  private requestSequence = 0;

  readonly items = this.itemsState.asReadonly();
  readonly summary = this.summaryState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly pages = this.pagesState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly filters = this.filtersState.asReadonly();
  readonly selectedTask = this.selectedTaskState.asReadonly();
  readonly activeDrawer = this.activeDrawerState.asReadonly();
  readonly drawerPrefill = this.drawerPrefillState.asReadonly();

  readonly hasItems = computed(() => this.itemsState().length > 0);
  readonly overdueCount = computed(() => this.summaryState().overdue);
  readonly urgentCount = computed(() => this.summaryState().urgent);
  readonly activeCount = computed(() => this.summaryState().toDo + this.summaryState().inProgress);

  async load(changes: Partial<TaskListFilters> = {}): Promise<void> {
    const filters = { ...this.filtersState(), ...changes };
    this.filtersState.set(filters);
    const sequence = ++this.requestSequence;
    this.loadingState.set(true);
    this.errorState.set(null);

    try {
      const res = await firstValueFrom(this.api.list(filters));
      if (sequence !== this.requestSequence) return;
      this.itemsState.set(res.items);
      this.summaryState.set(res.summary);
      this.totalState.set(res.pagination.total);
      this.pagesState.set(Math.max(res.pagination.pages, 1));
    } catch (err) {
      if (sequence !== this.requestSequence) return;
      this.itemsState.set([]);
      this.totalState.set(0);
      this.pagesState.set(1);
      this.errorState.set(getApiProblem(err).message);
    } finally {
      if (sequence === this.requestSequence) {
        this.loadingState.set(false);
      }
    }
  }

  async refreshSummary(): Promise<void> {
    try {
      const summary = await firstValueFrom(this.api.getSummary());
      this.summaryState.set(summary);
    } catch {
      // Best-effort
    }
  }

  selectTask(task: TaskDto | null): void {
    this.selectedTaskState.set(task);
  }

  openCreateDrawer(prefill?: Partial<CreateTaskInput>): void {
    this.drawerPrefillState.set(prefill ?? null);
    this.activeDrawerState.set('CREATE');
  }

  openDetailDrawer(task: TaskDto): void {
    this.selectedTaskState.set(task);
    this.activeDrawerState.set('DETAIL');
  }

  async openRemote(taskId: string): Promise<void> {
    const task = await firstValueFrom(this.api.getById(taskId));
    this.openDetailDrawer(task);
  }

  closeDrawer(): void {
    this.activeDrawerState.set(null);
    this.drawerPrefillState.set(null);
  }

  async createTask(input: CreateTaskInput): Promise<TaskDto> {
    const created = await firstValueFrom(this.api.create(input));
    await this.load();
    this.closeDrawer();
    return created;
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<TaskDto> {
    const updated = await firstValueFrom(this.api.update(taskId, input));
    this.updateItemInState(updated);
    await this.refreshSummary();
    return updated;
  }

  async startTask(taskId: string): Promise<TaskDto> {
    const updated = await firstValueFrom(this.api.start(taskId));
    this.updateItemInState(updated);
    await this.refreshSummary();
    return updated;
  }

  async completeTask(taskId: string, input: CompleteTaskInput = {}): Promise<TaskDto> {
    const updated = await firstValueFrom(this.api.complete(taskId, input));
    this.updateItemInState(updated);
    await this.refreshSummary();
    return updated;
  }

  async cancelTask(taskId: string, input: CancelTaskInput = {}): Promise<TaskDto> {
    const updated = await firstValueFrom(this.api.cancel(taskId, input));
    this.updateItemInState(updated);
    await this.refreshSummary();
    return updated;
  }

  private updateItemInState(task: TaskDto): void {
    this.itemsState.update((items) => items.map((it) => (it.id === task.id ? task : it)));
    if (this.selectedTaskState()?.id === task.id) {
      this.selectedTaskState.set(task);
    }
  }

  reset(): void {
    this.filtersState.set(INITIAL_FILTERS);
    this.itemsState.set([]);
    this.totalState.set(0);
    this.pagesState.set(1);
    this.selectedTaskState.set(null);
    this.activeDrawerState.set(null);
    this.drawerPrefillState.set(null);
  }
}

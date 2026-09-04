import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { getApiProblem } from '../../../../core/http/api-error';
import { CreateTaskDrawerComponent } from '../../../tasks/components/create-task-drawer/create-task-drawer.component';
import { TasksStore } from '../../../tasks/data-access/tasks.store';
import { FollowUpsApiService } from '../../data-access/follow-ups-api.service';
import type {
  CareContinuityResult,
  CareContinuityRow,
  CareContinuityState,
  FollowUpFilter,
  FollowUpResult,
  FollowUpRow,
  FollowUpSort,
} from '../../models/follow-up.models';

type WorklistMode = 'recommendations' | 'attention';

@Component({
  selector: 'app-follow-ups-page',
  imports: [DatePipe, FormsModule, RouterLink, CreateTaskDrawerComponent],
  templateUrl: './follow-ups-page.html',
  styleUrl: './follow-ups-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FollowUpsPage {
  private readonly api = inject(FollowUpsApiService);
  private readonly permissions = inject(PermissionService);
  readonly tasksStore = inject(TasksStore);
  protected readonly result = signal<FollowUpResult | null>(null);
  protected readonly attentionResult = signal<CareContinuityResult | null>(null);
  protected readonly mode = signal<WorklistMode>('recommendations');
  protected readonly attentionState = signal<CareContinuityState | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal<FollowUpFilter>('NEEDS_SCHEDULING');
  protected readonly sort = signal<FollowUpSort>('MOST_OVERDUE');
  protected readonly search = signal('');
  protected readonly page = signal(1);
  protected readonly canOpenSource = this.permissions.can(PERMISSIONS.CLINICAL_VISITS_VIEW);
  protected readonly canSchedule = this.permissions.can(PERMISSIONS.APPOINTMENTS_UPDATE);
  protected readonly filters: { value: FollowUpFilter; label: string }[] = [
    { value: 'NEEDS_SCHEDULING', label: 'Needs scheduling' },
    { value: 'OVERDUE', label: 'Overdue' },
    { value: 'DUE_SOON', label: 'Due soon' },
    { value: 'SCHEDULED', label: 'Scheduled' },
    { value: 'ALL', label: 'All' },
  ];
  protected readonly emptyTitle = computed(() =>
    this.filter() === 'ALL' ? 'No follow-ups yet' : 'You’re all caught up',
  );

  protected readonly hasActiveFilters = computed(() => {
    if (this.search().trim()) return true;
    if (this.mode() === 'recommendations') {
      return this.filter() !== 'NEEDS_SCHEDULING';
    }
    return this.attentionState() !== null;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      if (this.mode() === 'attention') {
        this.attentionResult.set(
          await firstValueFrom(
            this.api.listAttention({
              page: this.page(),
              limit: 20,
              ...(this.attentionState() ? { state: this.attentionState()! } : {}),
              ...(this.search().trim() ? { search: this.search().trim() } : {}),
            }),
          ),
        );
      } else {
        this.result.set(
          await firstValueFrom(
            this.api.list({
              page: this.page(),
              limit: 20,
              filter: this.filter(),
              sort: this.sort(),
              ...(this.search().trim() ? { search: this.search().trim() } : {}),
            }),
          ),
        );
      }
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected chooseMode(mode: WorklistMode): void {
    this.mode.set(mode);
    this.page.set(1);
    void this.load();
  }

  protected chooseAttentionState(state: CareContinuityState | null): void {
    this.attentionState.set(state);
    this.page.set(1);
    void this.load();
  }

  protected chooseFilter(filter: FollowUpFilter): void {
    this.filter.set(filter);
    this.page.set(1);
    void this.load();
  }

  protected searchChanged(value: string): void {
    this.search.set(value);
    this.page.set(1);
    void this.load();
  }

  protected sortChanged(value: string): void {
    this.sort.set(value as FollowUpSort);
    this.page.set(1);
    void this.load();
  }

  protected goToPage(page: number): void {
    this.page.set(page);
    void this.load();
  }

  protected stateLabel(state: string): string {
    return state
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  createTaskForFollowUp(row: FollowUpRow): void {
    const sourceId = row.sourceVisit?.id ?? row.sourceRetentionPlan?.id;
    if (!sourceId) return;
    this.tasksStore.openCreateDrawer({
      title: `Relancer ${row.patient.fullName} pour son suivi`,
      context: {
        type: 'FOLLOW_UP',
        entityId: sourceId,
        patientId: row.patient.id,
        labelSnapshot: `${row.patient.fullName} (Suivi)`,
      },
    });
  }

  createTaskForAttention(row: CareContinuityRow): void {
    this.tasksStore.openCreateDrawer({
      title: `Reprendre contact avec ${row.patient.fullName}`,
      context: {
        type: row.context.type === 'RETENTION' ? 'RETENTION' : 'TREATMENT',
        entityId: row.context.retentionPlanId ?? row.context.treatment.id,
        patientId: row.patient.id,
        labelSnapshot: `${row.patient.fullName} (${row.context.type === 'RETENTION' ? 'Contention' : 'Traitement'})`,
      },
    });
  }

  protected reasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      NO_RECENT_VISIT: 'No recent clinical visit',
      NO_FUTURE_APPOINTMENT: 'No future appointment',
      RETENTION_CONTROL_OVERDUE: 'Retention control overdue',
      MISSED_NOT_REBOOKED: 'Missed appointment not rebooked',
    };
    return labels[reason] ?? this.stateLabel(reason);
  }

  protected refresh(): void {
    void this.load();
  }

  protected clearSearch(): void {
    this.search.set('');
    this.page.set(1);
    void this.load();
  }

  protected resetFilters(): void {
    this.search.set('');
    if (this.mode() === 'recommendations') {
      this.filter.set('NEEDS_SCHEDULING');
    } else {
      this.attentionState.set(null);
    }
    this.page.set(1);
    void this.load();
  }

  protected getInitials(name: string | null | undefined): string {
    if (!name) return 'PT';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  protected getFilterCount(value: FollowUpFilter): number | null {
    const res = this.result();
    if (!res) return null;
    switch (value) {
      case 'NEEDS_SCHEDULING':
        return res.summary.needsScheduling;
      case 'OVERDUE':
        return res.summary.overdue;
      case 'SCHEDULED':
        return res.summary.scheduled;
      case 'ALL':
        return res.pagination.total;
      default:
        return null;
    }
  }

  protected getAttentionCount(state: CareContinuityState | null): number | null {
    const res = this.attentionResult();
    if (!res) return null;
    if (state === 'NEEDS_ATTENTION') return res.summary.needsAttention;
    if (state === 'LOST_TO_FOLLOW_UP') return res.summary.lostToFollowUp;
    return res.pagination.total;
  }
}


import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { CreateTaskDrawerComponent } from '../../components/create-task-drawer/create-task-drawer.component';
import { TaskDetailDrawerComponent } from '../../components/task-detail-drawer/task-detail-drawer.component';
import { TasksStore } from '../../data-access/tasks.store';
import type { TaskAttachment, TaskDto, TaskScope, TaskStatus } from '../../models/task.models';

@Component({
  selector: 'app-tasks-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateTaskDrawerComponent, TaskDetailDrawerComponent],
  template: `
    <div class="tasks-workspace">
      <!-- Masthead -->
      <header class="tasks-masthead">
        <div class="tasks-masthead__titles">
          <span class="tasks-masthead__eyebrow">COORDINATION CLINIQUE & DÉLÉGATION</span>
          <h1>Tâches internes</h1>
          <p>
            Déléguez des actions au cabinet, suivez les urgences et pilotez les consignes d'équipe.
          </p>
        </div>

        <div class="tasks-masthead__actions">
          <button type="button" class="btn-new-task" (click)="store.openCreateDrawer()">
            <span class="material-icons" aria-hidden="true">add_task</span>
            <span>Nouvelle tâche</span>
          </button>
        </div>
      </header>

      <!-- KPI Summary Strip -->
      <section class="tasks-metrics" aria-label="Indicateurs des tâches">
        <div class="metric-card">
          <span class="metric-card__label">À faire</span>
          <div class="metric-card__value-row">
            <span class="metric-card__value">{{ store.summary().toDo }}</span>
            <span class="metric-card__sub">en attente</span>
          </div>
        </div>

        <div class="metric-card">
          <span class="metric-card__label">En cours</span>
          <div class="metric-card__value-row">
            <span class="metric-card__value">{{ store.summary().inProgress }}</span>
            <span class="metric-card__sub">actives</span>
          </div>
        </div>

        <div class="metric-card" [class.is-overdue-alert]="store.summary().overdue > 0">
          <span class="metric-card__label">En retard</span>
          <div class="metric-card__value-row">
            <span class="metric-card__value">{{ store.summary().overdue }}</span>
            <span class="metric-card__sub">à traiter</span>
          </div>
        </div>

        <div class="metric-card" [class.is-urgent-alert]="store.summary().urgent > 0">
          <span class="metric-card__label">Urgentes</span>
          <div class="metric-card__value-row">
            <span class="metric-card__value">{{ store.summary().urgent }}</span>
            <span class="metric-card__sub">priorité haute</span>
          </div>
        </div>

        <div class="metric-card">
          <span class="metric-card__label">Terminées auj.</span>
          <div class="metric-card__value-row">
            <span class="metric-card__value">{{ store.summary().completedToday }}</span>
            <span class="metric-card__sub">actions</span>
          </div>
        </div>
      </section>

      <!-- Scope Tabs & Controls Bar -->
      <section class="tasks-controls">
        <div class="tasks-scope-tabs">
          <button
            type="button"
            class="scope-tab"
            [class.is-active]="selectedScope() === 'MINE'"
            (click)="setScope('MINE')"
          >
            <span>Mes tâches</span>
            <span
              class="badge-count"
              [class.has-overdue]="store.overdueCount() > 0 && selectedScope() === 'MINE'"
            >
              {{ store.activeCount() }}
            </span>
          </button>

          <button
            type="button"
            class="scope-tab"
            [class.is-active]="selectedScope() === 'ASSIGNED_BY_ME'"
            (click)="setScope('ASSIGNED_BY_ME')"
          >
            <span>Assignées par moi</span>
          </button>

          @if (canViewTeamTasks()) {
            <button
              type="button"
              class="scope-tab"
              [class.is-active]="selectedScope() === 'TEAM'"
              (click)="setScope('TEAM')"
            >
              <span>Toute l'équipe</span>
            </button>
          }
        </div>

        <div class="tasks-filter-bar">
          <div class="filter-pills">
            <button
              type="button"
              class="pill-btn"
              [class.is-active]="selectedStatus() === 'ACTIVE'"
              (click)="setStatusFilter('ACTIVE')"
            >
              Actives (À faire & En cours)
            </button>

            <button
              type="button"
              class="pill-btn pill-overdue"
              [class.is-active]="selectedStatus() === 'OVERDUE'"
              (click)="setStatusFilter('OVERDUE')"
            >
              En retard
              @if (store.overdueCount() > 0) {
                <span>• {{ store.overdueCount() }}</span>
              }
            </button>

            <button
              type="button"
              class="pill-btn"
              [class.is-active]="selectedStatus() === 'TODO'"
              (click)="setStatusFilter('TODO')"
            >
              À faire
            </button>

            <button
              type="button"
              class="pill-btn"
              [class.is-active]="selectedStatus() === 'IN_PROGRESS'"
              (click)="setStatusFilter('IN_PROGRESS')"
            >
              En cours
            </button>

            <button
              type="button"
              class="pill-btn"
              [class.is-active]="selectedStatus() === 'COMPLETED'"
              (click)="setStatusFilter('COMPLETED')"
            >
              Terminées
            </button>

            <button
              type="button"
              class="pill-btn"
              [class.is-active]="selectedStatus() === 'ALL'"
              (click)="setStatusFilter('ALL')"
            >
              Toutes
            </button>
          </div>

          <div class="search-box">
            <span class="material-icons" aria-hidden="true">search</span>
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (ngModelChange)="onSearchChange($event)"
              placeholder="Rechercher une tâche, patient..."
            />
          </div>
        </div>
      </section>

      <!-- Task Cards Stream -->
      @if (store.loading()) {
        <div class="tasks-loading">
          <div class="spinner"></div>
          <span>Chargement des tâches…</span>
        </div>
      } @else if (store.items().length === 0) {
        <div class="tasks-empty-state">
          <span class="material-icons" aria-hidden="true">task_alt</span>
          <h3>Aucune tâche trouvée</h3>
          <p>
            Toutes les actions sont à jour pour cette sélection. Créez une nouvelle tâche pour
            déléguer une action interne.
          </p>
          <button
            type="button"
            class="btn-new-task"
            style="margin-top: 0.5rem;"
            (click)="store.openCreateDrawer()"
          >
            <span class="material-icons" aria-hidden="true">add</span>
            <span>Créer une tâche</span>
          </button>
        </div>
      } @else {
        <div class="tasks-list">
          @for (task of store.items(); track task.id) {
            <article
              class="task-card"
              [class.is-overdue]="task.isOverdue"
              [class.is-completed]="task.status === 'COMPLETED'"
              role="button"
              tabindex="0"
              (click)="store.openDetailDrawer(task)"
              (keydown.enter)="store.openDetailDrawer(task)"
            >
              <!-- Quick check button -->
              <button
                type="button"
                class="task-card__check-btn"
                [class.is-checked]="task.status === 'COMPLETED'"
                [disabled]="task.status === 'CANCELLED'"
                (click)="$event.stopPropagation(); quickToggleComplete(task)"
                title="Marquer comme terminée"
              >
                <span class="material-icons" aria-hidden="true">check</span>
              </button>

              <div class="task-card__body">
                <div class="task-card__header-row">
                  @if (task.isOverdue) {
                    <span class="badge-tag badge-overdue">En retard</span>
                  }
                  @if (task.priority === 'URGENT') {
                    <span class="badge-tag badge-urgent">Urgente</span>
                  } @else if (task.priority === 'HIGH') {
                    <span class="badge-tag badge-high">Haute</span>
                  }

                  <h3 class="task-card__title">{{ task.title }}</h3>
                </div>

                <div class="task-card__meta-row">
                  @if (task.context) {
                    <span class="task-chip-context">
                      <span class="material-icons" aria-hidden="true">link</span>
                      {{
                        task.context.label || (task.patient ? task.patient.fullName : 'Contexte')
                      }}
                    </span>
                  }

                  @if (task.dueAt) {
                    <span class="task-chip-due" [class.is-overdue]="task.isOverdue">
                      <span class="material-icons" aria-hidden="true">event</span>
                      {{ task.dueAt | date: 'mediumDate' }}
                    </span>
                  }

                  @if (task.attachments && task.attachments.length > 0) {
                    <span
                      class="task-chip-context"
                      style="background: var(--color-porcelain); color: var(--color-slate);"
                    >
                      <span class="material-icons" aria-hidden="true" style="font-size: 0.85rem;"
                        >attachment</span
                      >
                      {{ task.attachments.length }} doc{{ task.attachments.length > 1 ? 's' : '' }}
                    </span>
                  }
                </div>

                <!-- Attached Images & PDFs thumbnail preview strip -->
                @if (task.attachments && task.attachments.length > 0) {
                  <div class="task-card__attachments-strip">
                    @for (att of task.attachments; track $index) {
                      <div class="task-card__thumb-badge" [title]="att.name">
                        @if (isImage(att)) {
                          <img [src]="att.url" [alt]="att.name" class="task-thumb-img" />
                        } @else {
                          <span class="material-icons task-thumb-pdf" aria-hidden="true"
                            >picture_as_pdf</span
                          >
                        }
                        <span class="task-thumb-name">{{ att.name }}</span>
                      </div>
                    }
                  </div>
                }
              </div>

              <div class="task-card__assignee">
                <div class="task-card__assignee-text">
                  <strong>{{ task.assignedTo.displayName }}</strong>
                  <small>{{ task.assignedTo.role ?? 'Équipe' }}</small>
                </div>

                <div class="task-avatar" [title]="task.assignedTo.displayName">
                  {{ getInitials(task.assignedTo.displayName) }}
                </div>

                <span class="material-icons task-card__chevron" aria-hidden="true"
                  >chevron_right</span
                >
              </div>
            </article>
          }
        </div>
      }

      <!-- Slide-over Drawers -->
      <app-create-task-drawer />
      <app-task-detail-drawer />
    </div>
  `,
  styleUrl: './tasks-page.component.scss',
})
export class TasksPageComponent implements OnInit {
  readonly store = inject(TasksStore);
  private readonly permissions = inject(PermissionService);
  private readonly route = inject(ActivatedRoute);

  selectedScope = signal<TaskScope>('MINE');
  selectedStatus = signal<TaskStatus | 'ALL' | 'ACTIVE' | 'OVERDUE'>('ACTIVE');
  searchQuery = '';

  readonly canViewTeamTasks = computed(() => this.permissions.can(PERMISSIONS.TASKS_MANAGE));

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.store.load({ scope: 'MINE', status: 'ACTIVE' });
    const taskId = this.route.snapshot.queryParamMap.get('taskId');
    if (taskId) await this.store.openRemote(taskId);
  }

  setScope(scope: TaskScope): void {
    this.selectedScope.set(scope);
    this.store.load({ scope, page: 1 });
  }

  setStatusFilter(status: TaskStatus | 'ALL' | 'ACTIVE' | 'OVERDUE'): void {
    this.selectedStatus.set(status);
    this.store.load({ status, page: 1 });
  }

  onSearchChange(search: string): void {
    this.store.load({ search, page: 1 });
  }

  isImage(att: TaskAttachment): boolean {
    if (att.mimeType?.startsWith('image/')) return true;
    const lower = (att.name || '').toLowerCase();
    return (
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.webp')
    );
  }

  getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  async quickToggleComplete(task: TaskDto): Promise<void> {
    if (task.status === 'COMPLETED') return;
    await this.store.completeTask(task.id);
  }
}

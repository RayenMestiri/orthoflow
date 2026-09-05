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

          <div class="tasks-filter-actions">
            <div class="search-box">
              <span class="material-icons" aria-hidden="true">search</span>
              <input
                type="text"
                [(ngModel)]="searchQuery"
                (ngModelChange)="onSearchChange($event)"
                placeholder="Rechercher une tâche, patient..."
              />
            </div>

            <div class="view-mode-toggle" role="group" aria-label="Mode d'affichage">
              <button
                type="button"
                class="view-mode-btn"
                [class.is-active]="viewMode() === 'grid'"
                (click)="viewMode.set('grid')"
                title="Affichage en boîtes (grille)"
                aria-label="Affichage en boîtes"
              >
                <span class="material-icons" aria-hidden="true">grid_view</span>
                <span>Cartes</span>
              </button>
              <button
                type="button"
                class="view-mode-btn"
                [class.is-active]="viewMode() === 'list'"
                (click)="viewMode.set('list')"
                title="Affichage en liste"
                aria-label="Affichage en liste"
              >
                <span class="material-icons" aria-hidden="true">view_list</span>
                <span>Liste</span>
              </button>
            </div>
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
          <div class="empty-state-aura">
            <div class="empty-state-badge">
              <span class="material-icons" aria-hidden="true">assignment_turned_in</span>
              <span class="empty-state-sparkle material-icons" aria-hidden="true">auto_awesome</span>
            </div>
          </div>

          <div class="empty-state-content">
            <h3>Aucune tâche trouvée</h3>
            <p>
              Toutes les actions sont à jour pour cette sélection. Créez une nouvelle tâche pour
              déléguer une action interne et coordonner votre équipe.
            </p>
          </div>

          <div class="empty-state-actions">
            <button
              type="button"
              class="btn-new-task btn-new-task--empty"
              (click)="store.openCreateDrawer()"
            >
              <div class="btn-icon-wrapper">
                <span class="material-icons" aria-hidden="true">add_task</span>
              </div>
              <span>Créer une tâche</span>
            </button>
          </div>

          <div class="empty-state-suggestions">
            <span class="suggestions-title">Suggestions rapides :</span>
            <div class="suggestions-chips">
              <button
                type="button"
                class="empty-shortcut-chip"
                (click)="store.openCreateDrawer({ title: 'Rappeler le tuteur pour accord' })"
              >
                <span class="material-icons" aria-hidden="true">phone_in_talk</span>
                <span>Rappeler tuteur</span>
              </button>

              <button
                type="button"
                class="empty-shortcut-chip"
                (click)="store.openCreateDrawer({ title: 'Vérifier réception appareil' })"
              >
                <span class="material-icons" aria-hidden="true">inventory_2</span>
                <span>Réception appareil</span>
              </button>

              <button
                type="button"
                class="empty-shortcut-chip"
                (click)="store.openCreateDrawer({ title: 'Vérifier radiographie panoramique' })"
              >
                <span class="material-icons" aria-hidden="true">medical_services</span>
                <span>Vérifier radio</span>
              </button>

              <button
                type="button"
                class="empty-shortcut-chip"
                (click)="store.openCreateDrawer({ title: 'Préparer dossier et devis' })"
              >
                <span class="material-icons" aria-hidden="true">description</span>
                <span>Préparer devis</span>
              </button>
            </div>
          </div>
        </div>
      } @else {
        <div class="tasks-list" [class.is-grid-mode]="viewMode() === 'grid'">
          @for (task of store.items(); track task.id) {
            <article
              class="task-card"
              [class.is-grid-card]="viewMode() === 'grid'"
              [class.is-overdue]="task.isOverdue"
              [class.is-completed]="task.status === 'COMPLETED'"
              role="button"
              tabindex="0"
              (click)="store.openDetailDrawer(task)"
              (keydown.enter)="store.openDetailDrawer(task)"
            >
              <!-- Card Header Row in Box Mode -->
              <div class="task-card__top">
                <div class="task-card__badges">
                  @if (task.isOverdue) {
                    <span class="badge-tag badge-overdue">En retard</span>
                  }
                  @if (task.priority === 'URGENT') {
                    <span class="badge-tag badge-urgent">Urgente</span>
                  } @else if (task.priority === 'HIGH') {
                    <span class="badge-tag badge-high">Haute</span>
                  }
                </div>

                <!-- Quick check button -->
                <button
                  type="button"
                  class="task-card__check-btn"
                  [class.is-checked]="task.status === 'COMPLETED'"
                  [disabled]="task.status === 'CANCELLED'"
                  (click)="$event.stopPropagation(); quickToggleComplete(task)"
                  title="Marquer comme terminée"
                  aria-label="Marquer comme terminée"
                >
                  <span class="material-icons" aria-hidden="true">check</span>
                </button>
              </div>

              <div class="task-card__body">
                <h3 class="task-card__title">{{ task.title }}</h3>

                <div class="task-card__meta-row">
                  @if (task.context) {
                    <span class="task-chip-context">
                      <span class="material-icons" aria-hidden="true">person</span>
                      {{ task.context.label || (task.patient ? task.patient.fullName : 'Contexte') }}
                    </span>
                  }

                  @if (task.dueAt) {
                    <span class="task-chip-due" [class.is-overdue]="task.isOverdue">
                      <span class="material-icons" aria-hidden="true">event</span>
                      {{ task.dueAt | date: 'mediumDate' }}
                    </span>
                  }

                  @if (task.attachments && task.attachments.length > 0) {
                    <span class="task-chip-context task-chip-doc-count">
                      <span class="material-icons" aria-hidden="true" style="font-size: 0.85rem;">attach_file</span>
                      {{ task.attachments.length }} doc{{ task.attachments.length > 1 ? 's' : '' }}
                    </span>
                  }
                </div>

                <!-- Attached Images & PDFs: Rich Big Preview Gallery -->
                @if (task.attachments && task.attachments.length > 0) {
                  <div
                    class="task-card__media-showcase"
                    [class.single-item]="task.attachments.length === 1"
                    [class.multi-items]="task.attachments.length > 1"
                  >
                    @for (att of task.attachments; track $index) {
                      <div class="task-media-card" [class.is-image-media]="isImage(att)" [title]="att.name">
                        @if (isImage(att)) {
                          <div class="task-image-wrapper">
                            <img [src]="att.url" [alt]="att.name" class="task-large-img" loading="lazy" />
                            <div class="task-image-pill-overlay">
                              <span class="material-icons" aria-hidden="true">visibility</span>
                              <span class="task-image-pill-name">{{ att.name }}</span>
                            </div>
                          </div>
                        } @else {
                          <div class="task-pdf-wrapper">
                            <span class="material-icons task-pdf-icon" aria-hidden="true">picture_as_pdf</span>
                            <div class="task-pdf-meta">
                              <strong class="task-pdf-filename">{{ att.name }}</strong>
                              <small class="task-pdf-hint">Document PDF joint</small>
                            </div>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              </div>

              <div class="task-card__footer">
                <div class="task-card__assignee">
                  <div class="task-avatar" [title]="task.assignedTo.displayName">
                    {{ getInitials(task.assignedTo.displayName) }}
                  </div>
                  <div class="task-card__assignee-text">
                    <strong>{{ task.assignedTo.displayName }}</strong>
                    <small>{{ task.assignedTo.role ?? 'Équipe' }}</small>
                  </div>
                </div>

                <span class="material-icons task-card__chevron" aria-hidden="true">chevron_right</span>
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
  viewMode = signal<'grid' | 'list'>('grid');
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

import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth.store';
import { TasksApiService } from '../../data-access/tasks.api';
import { TasksStore } from '../../data-access/tasks.store';
import type {
  TaskAttachment,
  TaskDto,
  TaskPriority,
  UpdateTaskInput,
} from '../../models/task.models';

interface StaffOption {
  userId: string;
  name: string;
  role: string;
}

@Component({
  selector: 'app-task-detail-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (store.activeDrawer() === 'DETAIL' && store.selectedTask(); as task) {
      <div
        class="drawer-overlay"
        aria-labelledby="slide-over-title"
        role="dialog"
        aria-modal="true"
      >
        <!-- Backdrop -->
        <div class="drawer-backdrop" aria-hidden="true"></div>

        <div class="drawer-panel">
          <!-- Header -->
          <div class="drawer-header">
            <div class="drawer-header__badges">
              <!-- Status Pill -->
              @switch (task.status) {
                @case ('TODO') {
                  <span class="status-pill status-todo">À faire</span>
                }
                @case ('IN_PROGRESS') {
                  <span class="status-pill status-in-progress">En cours</span>
                }
                @case ('COMPLETED') {
                  <span class="status-pill status-completed">✓ Terminée</span>
                }
                @case ('CANCELLED') {
                  <span class="status-pill status-cancelled">Annulée</span>
                }
              }

              <!-- Priority Pill -->
              @if (task.priority === 'URGENT') {
                <span
                  class="badge-tag badge-urgent"
                  style="font-size:0.68rem; font-weight:800; text-transform:uppercase; padding:0.15rem 0.5rem; border-radius:999px; background:#fee2e2; color:var(--color-danger); border:1px solid #fca5a5;"
                  >Urgente</span
                >
              } @else if (task.priority === 'HIGH') {
                <span
                  class="badge-tag badge-high"
                  style="font-size:0.68rem; font-weight:800; text-transform:uppercase; padding:0.15rem 0.5rem; border-radius:999px; background:#fef3c7; color:#92400e; border:1px solid #fde68a;"
                  >Haute</span
                >
              }

              <!-- Overdue Badge -->
              @if (task.isOverdue) {
                <span
                  class="badge-tag badge-overdue"
                  style="font-size:0.68rem; font-weight:800; text-transform:uppercase; padding:0.15rem 0.5rem; border-radius:999px; background:var(--color-danger); color:var(--color-white);"
                  >En retard</span
                >
              }
            </div>

            <div class="drawer-header__actions">
              <!-- Edit Task Button (if not completed or cancelled) -->
              @if (!isEditing() && (task.status === 'TODO' || task.status === 'IN_PROGRESS')) {
                <button
                  type="button"
                  class="btn-header-action"
                  (click)="startEditing(task)"
                  title="Modifier cette tâche"
                >
                  <span class="material-icons" aria-hidden="true">edit</span>
                  <span>Modifier</span>
                </button>
              }

              <button type="button" class="drawer-close-btn" (click)="close()" title="Fermer">
                <span class="material-icons" aria-hidden="true">close</span>
              </button>
            </div>
          </div>

          <!-- Body -->
          <div class="drawer-body">
            @if (isEditing()) {
              <!-- Edit Mode Form -->
              <form (ngSubmit)="saveEdit(task.id)" class="edit-mode-form">
                <div class="form-group">
                  <label for="edit-task-title">Action à réaliser <span class="req">*</span></label>
                  <input
                    id="edit-task-title"
                    type="text"
                    [(ngModel)]="editTitle"
                    name="editTitle"
                    required
                    maxlength="140"
                  />
                </div>

                <div class="form-group">
                  <label for="edit-task-assignee">Responsable <span class="req">*</span></label>
                  <select
                    id="edit-task-assignee"
                    [(ngModel)]="editAssignedToUserId"
                    name="editAssignedToUserId"
                    required
                  >
                    @for (staff of staffOptions(); track staff.userId) {
                      <option [value]="staff.userId">{{ staff.name }} ({{ staff.role }})</option>
                    }
                  </select>
                </div>

                <div class="form-group">
                  <span class="form-label">Priorité</span>
                  <div class="priority-toggle-group">
                    <button
                      type="button"
                      class="priority-btn is-normal"
                      [class.is-selected]="editPriority === 'NORMAL'"
                      (click)="editPriority = 'NORMAL'"
                    >
                      <span class="dot"></span>
                      <span>Normale</span>
                    </button>
                    <button
                      type="button"
                      class="priority-btn is-high"
                      [class.is-selected]="editPriority === 'HIGH'"
                      (click)="editPriority = 'HIGH'"
                    >
                      <span class="dot"></span>
                      <span>Haute</span>
                    </button>
                    <button
                      type="button"
                      class="priority-btn is-urgent"
                      [class.is-selected]="editPriority === 'URGENT'"
                      (click)="editPriority = 'URGENT'"
                    >
                      <span class="dot"></span>
                      <span>Urgente</span>
                    </button>
                  </div>
                </div>

                <div class="form-group">
                  <span class="form-label">Échéance</span>
                  <div class="due-presets">
                    <button
                      type="button"
                      class="due-preset-btn"
                      [class.is-selected]="editDuePreset() === 'TODAY'"
                      (click)="setEditDuePreset('TODAY')"
                    >
                      Aujourd'hui
                    </button>
                    <button
                      type="button"
                      class="due-preset-btn"
                      [class.is-selected]="editDuePreset() === 'TOMORROW'"
                      (click)="setEditDuePreset('TOMORROW')"
                    >
                      Demain
                    </button>
                    <button
                      type="button"
                      class="due-preset-btn"
                      [class.is-selected]="editDuePreset() === 'IN_3_DAYS'"
                      (click)="setEditDuePreset('IN_3_DAYS')"
                    >
                      Dans 3 jours
                    </button>
                    <button
                      type="button"
                      class="due-preset-btn"
                      [class.is-selected]="editDuePreset() === 'NONE'"
                      (click)="setEditDuePreset('NONE')"
                    >
                      Sans date
                    </button>
                  </div>

                  @if (editDuePreset() !== 'NONE') {
                    <input type="date" [(ngModel)]="editDueDate" name="editDueDate" />
                  }
                </div>

                <!-- Edit Attachments -->
                <div class="form-group">
                  <span class="form-label">Pièces jointes & Documents</span>
                  <input
                    #editFileInput
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    (change)="onEditFileSelected($event)"
                    style="display: none;"
                  />
                  <button type="button" class="upload-zone-compact" (click)="editFileInput.click()">
                    <span class="material-icons" aria-hidden="true">add_photo_alternate</span>
                    <span>Ajouter une image, radio ou PDF</span>
                  </button>

                  @if (editAttachments().length > 0) {
                    <div class="attachments-grid" style="margin-top: 0.5rem;">
                      @for (att of editAttachments(); track $index; let i = $index) {
                        <div class="attachment-card">
                          <div class="attachment-thumb">
                            @if (isImage(att)) {
                              <img [src]="att.url" [alt]="att.name" />
                            } @else {
                              <span class="material-icons" aria-hidden="true">picture_as_pdf</span>
                            }
                          </div>
                          <div class="attachment-card-info">
                            <strong [title]="att.name">{{ att.name }}</strong>
                            <small>{{ isImage(att) ? 'Image' : 'PDF' }}</small>
                          </div>
                          <button
                            type="button"
                            class="btn-remove-att-icon"
                            (click)="removeEditAttachment(i)"
                            title="Supprimer"
                          >
                            <span class="material-icons" aria-hidden="true">close</span>
                          </button>
                        </div>
                      }
                    </div>
                  }
                </div>

                <div class="form-group">
                  <label for="edit-task-desc">Détails / Instructions</label>
                  <textarea
                    id="edit-task-desc"
                    [(ngModel)]="editDescription"
                    name="editDescription"
                    rows="3"
                    maxlength="1000"
                  ></textarea>
                </div>

                @if (errorMessage()) {
                  <div style="color: var(--color-danger); font-size: 0.8rem; font-weight: 700;">
                    {{ errorMessage() }}
                  </div>
                }

                <div
                  style="display: flex; justify-content: flex-end; gap: 0.65rem; margin-top: 0.5rem;"
                >
                  <button type="button" class="btn-secondary" (click)="cancelEditing()">
                    Annuler
                  </button>
                  <button
                    type="submit"
                    class="btn-primary"
                    [disabled]="isActionRunning() || !editTitle.trim()"
                  >
                    Enregistrer
                  </button>
                </div>
              </form>
            } @else {
              <!-- View Mode -->
              <!-- Title & Description -->
              <div class="detail-title-section">
                <h1 id="slide-over-title">{{ task.title }}</h1>
                @if (task.description) {
                  <div class="detail-desc">{{ task.description }}</div>
                }
              </div>

              <!-- Context Link Card (if tied to patient or appointment) -->
              @if (task.context) {
                <div class="detail-context-card">
                  <div class="context-header">
                    <small>Élément rattaché</small>
                    @if (task.context.patientId) {
                      <button
                        type="button"
                        class="link-patient"
                        (click)="goToPatient(task.context.patientId)"
                      >
                        Ouvrir le dossier patient →
                      </button>
                    }
                  </div>
                  <div class="context-content">
                    <div class="context-icon">
                      <span class="material-icons" aria-hidden="true">person</span>
                    </div>
                    <div>
                      <strong>{{
                        task.context.label || (task.patient ? task.patient.fullName : 'Contexte')
                      }}</strong>
                      @if (task.patient?.referenceNumber) {
                        <small>Dossier {{ task.patient?.referenceNumber }}</small>
                      }
                    </div>
                  </div>
                </div>
              }

              <!-- Attachments & Documents Gallery -->
              @if (task.attachments && task.attachments.length > 0) {
                <div class="detail-attachments-section">
                  <span class="section-label">
                    Documents & Radiographies joints ({{ task.attachments.length }})
                  </span>
                  <div class="attachments-grid">
                    @for (att of task.attachments; track $index) {
                      <button
                        type="button"
                        class="attachment-card"
                        (click)="handleAttachmentClick(att)"
                        title="Cliquer pour afficher"
                      >
                        <div class="attachment-thumb">
                          @if (isImage(att)) {
                            <img [src]="att.url" [alt]="att.name" />
                            <div class="thumb-hover-overlay">
                              <span class="material-icons" aria-hidden="true">zoom_in</span>
                              <span>Agrandir</span>
                            </div>
                          } @else {
                            <span class="material-icons" aria-hidden="true">picture_as_pdf</span>
                            <div class="thumb-hover-overlay">
                              <span class="material-icons" aria-hidden="true">open_in_new</span>
                              <span>Ouvrir PDF</span>
                            </div>
                          }
                        </div>
                        <div class="attachment-card-info">
                          <strong [title]="att.name">{{ att.name }}</strong>
                          @if (att.sizeBytes) {
                            <small>{{ formatBytes(att.sizeBytes) }}</small>
                          } @else {
                            <small>{{ isImage(att) ? 'Image' : 'PDF' }}</small>
                          }
                        </div>
                      </button>
                    }
                  </div>
                </div>
              }

              <!-- Metadata & Delegation Grid -->
              <div class="detail-metadata-grid">
                <!-- Assignee -->
                <div class="meta-item">
                  <span class="meta-label">Responsable</span>
                  <div class="meta-user">
                    <div class="avatar-sm">{{ getInitials(task.assignedTo.displayName) }}</div>
                    <div>
                      <strong>{{ task.assignedTo.displayName }}</strong>
                      <small>{{ task.assignedTo.role ?? 'Équipe' }}</small>
                    </div>
                  </div>
                </div>

                <!-- Creator -->
                <div class="meta-item">
                  <span class="meta-label">Créée par</span>
                  <div class="meta-user">
                    <div class="avatar-sm" style="background: var(--color-slate);">
                      {{ getInitials(task.createdBy.displayName) }}
                    </div>
                    <div>
                      <strong>{{ task.createdBy.displayName }}</strong>
                      <small>{{ task.createdAt | date: 'short' }}</small>
                    </div>
                  </div>
                </div>

                <!-- Due date -->
                <div class="meta-item">
                  <span class="meta-label">Échéance</span>
                  <span class="meta-date" [class.is-overdue]="task.isOverdue">
                    {{ task.dueAt ? (task.dueAt | date: 'mediumDate') : 'Aucune date limite' }}
                  </span>
                </div>

                <!-- Lifecycle state details -->
                <div class="meta-item">
                  @if (task.completedAt) {
                    <span class="meta-label">Terminée</span>
                    <span class="meta-date" style="color: var(--color-success);">{{
                      task.completedAt | date: 'short'
                    }}</span>
                    @if (task.completedBy) {
                      <small style="color: var(--color-slate); font-size: 0.72rem;"
                        >Par {{ task.completedBy.displayName }}</small
                      >
                    }
                  } @else if (task.cancelledAt) {
                    <span class="meta-label">Annulée</span>
                    <span class="meta-date" style="color: var(--color-muted);">{{
                      task.cancelledAt | date: 'short'
                    }}</span>
                    @if (task.cancellationReason) {
                      <small
                        style="color: var(--color-slate); font-size: 0.72rem; font-style: italic;"
                        >« {{ task.cancellationReason }} »</small
                      >
                    }
                  } @else if (task.startedAt) {
                    <span class="meta-label">Démarrée</span>
                    <span class="meta-date" style="color: #1d4ed8;">{{
                      task.startedAt | date: 'short'
                    }}</span>
                  } @else {
                    <span class="meta-label">Statut</span>
                    <span class="meta-date" style="color: var(--color-slate);">Non démarrée</span>
                  }
                </div>
              </div>

              <!-- Reassign box -->
              @if (isReassigning()) {
                <div
                  style="background: var(--color-porcelain); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--color-line); display: flex; flex-direction: column; gap: 0.75rem;"
                >
                  <label
                    for="task-reassign-select"
                    style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--color-pine-900);"
                  >
                    Sélectionner le nouveau responsable
                  </label>
                  <select
                    id="task-reassign-select"
                    [(ngModel)]="newAssigneeId"
                    style="padding: 0.5rem; border: 1px solid var(--color-mist); border-radius: var(--radius-sm); font-size: var(--font-size-sm);"
                  >
                    @for (staff of staffOptions(); track staff.userId) {
                      <option [value]="staff.userId">{{ staff.name }} ({{ staff.role }})</option>
                    }
                  </select>
                  <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                    <button type="button" class="btn-secondary" (click)="isReassigning.set(false)">
                      Annuler
                    </button>
                    <button
                      type="button"
                      class="btn-primary"
                      [disabled]="!newAssigneeId || isActionRunning()"
                      (click)="confirmReassign(task.id)"
                    >
                      Confirmer
                    </button>
                  </div>
                </div>
              }

              <!-- Cancel reason box -->
              @if (isCancelling()) {
                <div
                  style="background: #fef2f2; padding: 1rem; border-radius: var(--radius-md); border: 1px solid #fca5a5; display: flex; flex-direction: column; gap: 0.75rem;"
                >
                  <label
                    for="task-cancel-reason"
                    style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--color-danger);"
                  >
                    Motif d'annulation
                  </label>
                  <input
                    id="task-cancel-reason"
                    type="text"
                    [(ngModel)]="cancellationReason"
                    placeholder="Ex: Rendez-vous annulé, Action déjà faite..."
                    style="padding: 0.5rem; border: 1px solid #fca5a5; border-radius: var(--radius-sm); font-size: var(--font-size-sm);"
                  />
                  <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                    <button type="button" class="btn-secondary" (click)="isCancelling.set(false)">
                      Retour
                    </button>
                    <button
                      type="button"
                      class="btn-danger-ghost"
                      style="background: var(--color-danger); color: var(--color-white);"
                      [disabled]="isActionRunning()"
                      (click)="confirmCancel(task.id)"
                    >
                      Annuler la tâche
                    </button>
                  </div>
                </div>
              }
            }
          </div>

          <!-- Actions Footer (View Mode) -->
          @if (!isEditing() && (task.status === 'TODO' || task.status === 'IN_PROGRESS')) {
            <div class="drawer-footer">
              <div style="display: flex; gap: 0.5rem;">
                <button
                  type="button"
                  class="btn-danger-ghost"
                  (click)="isCancelling.set(true); isReassigning.set(false)"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  class="btn-secondary"
                  (click)="isReassigning.set(true); isCancelling.set(false)"
                >
                  Réassigner
                </button>
              </div>

              <div style="display: flex; gap: 0.5rem;">
                @if (task.status === 'TODO') {
                  <button
                    type="button"
                    class="btn-start"
                    [disabled]="isActionRunning()"
                    (click)="startTask(task.id)"
                  >
                    Démarrer
                  </button>
                }

                <button
                  type="button"
                  class="btn-complete"
                  [disabled]="isActionRunning()"
                  (click)="completeTask(task.id)"
                >
                  <span class="material-icons" aria-hidden="true">check</span>
                  <span>Terminer</span>
                </button>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Clinical Lightbox Fullscreen Modal -->
      @if (activeLightboxImage(); as img) {
        <div class="lightbox-overlay">
          <div class="lightbox-header">
            <div class="lightbox-title-box">
              <span class="material-icons" style="color: var(--color-pine-100);">image</span>
              <div>
                <strong>{{ img.name }}</strong>
                @if (img.sizeBytes) {
                  <small> — {{ formatBytes(img.sizeBytes) }}</small>
                }
              </div>
            </div>
            <div class="lightbox-actions">
              <button type="button" class="lightbox-btn" (click)="openInNewTab(img)">
                <span class="material-icons">open_in_new</span>
                <span>Plein écran</span>
              </button>
              <button
                type="button"
                class="lightbox-btn"
                style="background: rgba(255, 255, 255, 0.2);"
                (click)="closeLightbox()"
              >
                <span class="material-icons">close</span>
                <span>Fermer</span>
              </button>
            </div>
          </div>
          <div class="lightbox-body">
            <img [src]="img.url" [alt]="img.name" />
          </div>
        </div>
      }
    }
  `,
  styleUrl: './task-detail-drawer.component.scss',
})
export class TaskDetailDrawerComponent {
  readonly store = inject(TasksStore);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly api = inject(TasksApiService);

  isEditing = signal(false);
  isActionRunning = signal(false);
  isReassigning = signal(false);
  isCancelling = signal(false);
  newAssigneeId = '';
  cancellationReason = '';
  errorMessage = signal<string | null>(null);

  // Lightbox
  activeLightboxImage = signal<TaskAttachment | null>(null);

  // Edit fields
  editTitle = '';
  editDescription = '';
  editPriority: TaskPriority = 'NORMAL';
  editAssignedToUserId = '';
  editDueDate = '';
  editDuePreset = signal<'TODAY' | 'TOMORROW' | 'IN_3_DAYS' | 'NONE'>('NONE');
  editAttachments = signal<TaskAttachment[]>([]);

  private staffMembers = signal<StaffOption[]>([]);

  readonly staffOptions = computed(() => {
    const loaded = this.staffMembers();
    if (loaded.length > 0) return loaded;
    const user = this.auth.user();
    return [
      {
        userId: user?.id ?? '',
        name: user ? `${user.firstName} ${user.lastName}`.trim() : 'Moi-même',
        role: this.auth.activeMembership()?.role ?? 'Membre',
      },
    ];
  });

  constructor() {
    this.loadClinicStaff();
  }

  private async loadClinicStaff(): Promise<void> {
    const clinicId = this.auth.activeMembership()?.clinicId;
    if (!clinicId) return;

    this.api.getClinicMembers(clinicId).subscribe({
      next: (members) => {
        const options: StaffOption[] = members.map((m) => ({
          userId: m.userId,
          name: m.user ? `${m.user.firstName} ${m.user.lastName}`.trim() : 'Membre',
          role: m.role,
        }));
        if (options.length > 0) {
          this.staffMembers.set(options);
        }
      },
    });
  }

  close(): void {
    this.isEditing.set(false);
    this.isReassigning.set(false);
    this.isCancelling.set(false);
    this.activeLightboxImage.set(null);
    this.store.closeDrawer();
  }

  startEditing(task: TaskDto): void {
    this.isEditing.set(true);
    this.isReassigning.set(false);
    this.isCancelling.set(false);
    this.editTitle = task.title;
    this.editDescription = task.description ?? '';
    this.editPriority = task.priority;
    this.editAssignedToUserId = task.assignedTo.id;
    this.editAttachments.set(task.attachments ? [...task.attachments] : []);

    if (task.dueAt) {
      this.editDueDate = new Date(task.dueAt).toISOString().split('T')[0] ?? '';
      this.editDuePreset.set('NONE');
    } else {
      this.editDueDate = '';
      this.editDuePreset.set('NONE');
    }
  }

  cancelEditing(): void {
    this.isEditing.set(false);
  }

  setEditDuePreset(preset: 'TODAY' | 'TOMORROW' | 'IN_3_DAYS' | 'NONE'): void {
    this.editDuePreset.set(preset);
    const now = new Date();

    if (preset === 'TODAY') {
      this.editDueDate = now.toISOString().split('T')[0] ?? '';
    } else if (preset === 'TOMORROW') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      this.editDueDate = tomorrow.toISOString().split('T')[0] ?? '';
    } else if (preset === 'IN_3_DAYS') {
      const in3 = new Date(now);
      in3.setDate(in3.getDate() + 3);
      this.editDueDate = in3.toISOString().split('T')[0] ?? '';
    } else {
      this.editDueDate = '';
    }
  }

  onEditFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = (e.target?.result as string) || '';
        const attachment: TaskAttachment = {
          name: file.name,
          url,
          mimeType: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
          sizeBytes: file.size,
        };
        this.editAttachments.update((current) => [...current, attachment]);
      };
      reader.readAsDataURL(file);
    }
    input.value = '';
  }

  removeEditAttachment(index: number): void {
    this.editAttachments.update((current) => current.filter((_, i) => i !== index));
  }

  async saveEdit(taskId: string): Promise<void> {
    if (!this.editTitle.trim()) {
      this.errorMessage.set('Le titre de la tâche est obligatoire.');
      return;
    }

    this.isActionRunning.set(true);
    this.errorMessage.set(null);

    let dueAtIso: string | null = null;
    if (this.editDueDate) {
      const parsed = new Date(this.editDueDate);
      parsed.setHours(18, 0, 0, 0);
      dueAtIso = parsed.toISOString();
    }

    const payload: UpdateTaskInput = {
      title: this.editTitle.trim(),
      description: this.editDescription.trim() || null,
      priority: this.editPriority,
      assignedToUserId: this.editAssignedToUserId,
      dueAt: dueAtIso,
      attachments: this.editAttachments(),
    };

    try {
      await this.store.updateTask(taskId, payload);
      this.isEditing.set(false);
    } catch (err: unknown) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Erreur lors de la modification');
    } finally {
      this.isActionRunning.set(false);
    }
  }

  getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
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

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  handleAttachmentClick(att: TaskAttachment): void {
    if (this.isImage(att)) {
      this.activeLightboxImage.set(att);
    } else {
      this.openInNewTab(att);
    }
  }

  closeLightbox(): void {
    this.activeLightboxImage.set(null);
  }

  openInNewTab(att: TaskAttachment): void {
    if (att.url.startsWith('data:')) {
      const win = window.open();
      if (win) {
        if (this.isImage(att)) {
          win.document.write(
            `<img src="${att.url}" style="max-width:100%;height:auto;display:block;margin:auto;" />`,
          );
        } else {
          win.document.write(
            `<iframe src="${att.url}" frameborder="0" style="border:0; top:0; left:0; bottom:0; right:0; width:100%; height:100%;" allowfullscreen></iframe>`,
          );
        }
      }
    } else {
      window.open(att.url, '_blank');
    }
  }

  goToPatient(patientId: string): void {
    this.close();
    this.router.navigate(['/app/patients', patientId]);
  }

  async startTask(taskId: string): Promise<void> {
    this.isActionRunning.set(true);
    try {
      await this.store.startTask(taskId);
    } finally {
      this.isActionRunning.set(false);
    }
  }

  async completeTask(taskId: string): Promise<void> {
    this.isActionRunning.set(true);
    try {
      await this.store.completeTask(taskId);
    } finally {
      this.isActionRunning.set(false);
    }
  }

  async confirmReassign(taskId: string): Promise<void> {
    if (!this.newAssigneeId) return;
    this.isActionRunning.set(true);
    try {
      await this.store.updateTask(taskId, { assignedToUserId: this.newAssigneeId });
      this.isReassigning.set(false);
    } finally {
      this.isActionRunning.set(false);
    }
  }

  async confirmCancel(taskId: string): Promise<void> {
    this.isActionRunning.set(true);
    try {
      await this.store.cancelTask(taskId, { reason: this.cancellationReason.trim() || null });
      this.isCancelling.set(false);
    } finally {
      this.isActionRunning.set(false);
    }
  }
}

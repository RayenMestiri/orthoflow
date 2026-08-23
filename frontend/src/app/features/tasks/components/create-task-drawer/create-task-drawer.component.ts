import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../../core/auth/auth.store';
import { TasksApiService } from '../../data-access/tasks.api';
import { TasksStore } from '../../data-access/tasks.store';
import type { CreateTaskInput, TaskAttachment, TaskPriority } from '../../models/task.models';

interface StaffOption {
  userId: string;
  name: string;
  role: string;
  isSelf: boolean;
}

interface ActionSuggestion {
  label: string;
  priority?: TaskPriority;
  icon: string;
}

@Component({
  selector: 'app-create-task-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (store.activeDrawer() === 'CREATE') {
      <div class="drawer-overlay" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
        <!-- Backdrop -->
        <div class="drawer-backdrop" (click)="store.closeDrawer()"></div>

        <div class="drawer-panel">
          <!-- Header -->
          <div class="drawer-header">
            <div class="drawer-header__titles">
              <div class="drawer-icon-box">
                <span class="material-icons" aria-hidden="true">add_task</span>
              </div>
              <div>
                <h2 id="slide-over-title">Nouvelle tâche</h2>
                <p>Délégation interne & coordination</p>
              </div>
            </div>
            <button 
              type="button" 
              class="drawer-close-btn"
              (click)="store.closeDrawer()"
              title="Fermer">
              <span class="material-icons" aria-hidden="true">close</span>
            </button>
          </div>

          <!-- Form Content -->
          <form (ngSubmit)="submit()" class="drawer-body">
            <!-- Context Banner (if prefilled) -->
            @if (prefillContext(); as ctx) {
              <div class="context-locked-banner">
                <span class="material-icons" aria-hidden="true">link</span>
                <div>
                  <small>Contexte rattaché</small>
                  <strong>{{ ctx.labelSnapshot || 'Élément sélectionné' }}</strong>
                </div>
              </div>
            }

            <!-- Compact Horizontally Scrollable Action Suggestions (1 row / non-intrusive) -->
            <div class="action-suggestions-section">
              <div class="suggestions-label">
                <span>Actions fréquentes</span>
                <span class="hint">Glissez ou cliquez pour pré-remplir</span>
              </div>
              <div class="suggestions-scroll-container">
                @for (sug of actionSuggestions; track sug.label) {
                  <button 
                    type="button" 
                    class="suggestion-chip"
                    [class.is-active]="title === sug.label"
                    (click)="selectSuggestion(sug)">
                    <span class="material-icons" style="font-size: 0.8rem;" aria-hidden="true">{{ sug.icon }}</span>
                    <span>{{ sug.label }}</span>
                  </button>
                }
              </div>
            </div>

            <!-- Title -->
            <div class="form-group">
              <label for="task-title">
                Action à réaliser <span class="req">*</span>
              </label>
              <input 
                id="task-title"
                type="text" 
                [(ngModel)]="title" 
                name="title"
                required
                maxlength="140"
                placeholder="Ex: Appeler le tuteur pour accord, Vérifier la panoramique..."
              />
            </div>

            <!-- Assignee -->
            <div class="form-group">
              <label for="task-assignee">
                Assigner à <span class="req">*</span>
              </label>
              <select 
                id="task-assignee"
                [(ngModel)]="assignedToUserId" 
                name="assignedToUserId"
                required>
                @for (staff of staffOptions(); track staff.userId) {
                  <option [value]="staff.userId">
                    {{ staff.name }} ({{ staff.role }}) {{ staff.isSelf ? '— Moi-même' : '' }}
                  </option>
                }
              </select>
            </div>

            <!-- Priority -->
            <div class="form-group">
              <label>Priorité</label>
              <div class="priority-toggle-group">
                <button 
                  type="button" 
                  class="priority-btn is-normal"
                  [class.is-selected]="priority === 'NORMAL'"
                  (click)="priority = 'NORMAL'">
                  <span class="dot"></span>
                  <span>Normale</span>
                </button>

                <button 
                  type="button" 
                  class="priority-btn is-high"
                  [class.is-selected]="priority === 'HIGH'"
                  (click)="priority = 'HIGH'">
                  <span class="dot"></span>
                  <span>Haute</span>
                </button>

                <button 
                  type="button" 
                  class="priority-btn is-urgent"
                  [class.is-selected]="priority === 'URGENT'"
                  (click)="priority = 'URGENT'">
                  <span class="dot"></span>
                  <span>Urgente</span>
                </button>
              </div>
            </div>

            <!-- Quick Due Date -->
            <div class="form-group">
              <label>Échéance</label>
              <div class="due-presets">
                <button 
                  type="button" 
                  class="due-preset-btn"
                  [class.is-selected]="duePreset() === 'TODAY'"
                  (click)="setDuePreset('TODAY')">
                  Aujourd'hui
                </button>
                <button 
                  type="button" 
                  class="due-preset-btn"
                  [class.is-selected]="duePreset() === 'TOMORROW'"
                  (click)="setDuePreset('TOMORROW')">
                  Demain
                </button>
                <button 
                  type="button" 
                  class="due-preset-btn"
                  [class.is-selected]="duePreset() === 'IN_3_DAYS'"
                  (click)="setDuePreset('IN_3_DAYS')">
                  Dans 3 jours
                </button>
                <button 
                  type="button" 
                  class="due-preset-btn"
                  [class.is-selected]="duePreset() === 'NONE'"
                  (click)="setDuePreset('NONE')">
                  Sans date
                </button>
              </div>

              @if (duePreset() !== 'NONE') {
                <input 
                  type="date" 
                  [(ngModel)]="dueDate" 
                  name="dueDate"
                />
              }
            </div>

            <!-- Document Attachments (Images, PDF, Radios...) -->
            <div class="attachments-section">
              <label style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-slate);">
                Pièces jointes & Images / PDF
              </label>

              <!-- Upload trigger -->
              <input 
                #fileInput 
                type="file" 
                multiple 
                accept="image/*,application/pdf"
                (change)="onFileSelected($event)" 
                style="display: none;" 
              />
              <div class="upload-zone" (click)="fileInput.click()">
                <span class="material-icons" aria-hidden="true">cloud_upload</span>
                <span>Joindre une image, radiographie ou document PDF</span>
              </div>

              <!-- Attachments Image Thumbnail Previews -->
              @if (attachments().length > 0) {
                <div class="attachments-grid-preview">
                  @for (att of attachments(); track $index; let i = $index) {
                    <div class="attachment-preview-card">
                      <div class="preview-thumb">
                        @if (isImage(att)) {
                          <img [src]="att.url" [alt]="att.name" />
                        } @else {
                          <span class="material-icons" aria-hidden="true">picture_as_pdf</span>
                        }
                      </div>
                      <div class="preview-meta">
                        <strong [title]="att.name">{{ att.name }}</strong>
                        @if (att.sizeBytes) {
                          <small>{{ formatBytes(att.sizeBytes) }}</small>
                        }
                      </div>
                      <button 
                        type="button" 
                        class="btn-remove-preview"
                        (click)="removeAttachment(i)"
                        title="Supprimer">
                        <span class="material-icons" aria-hidden="true">close</span>
                      </button>
                    </div>
                  }
                </div>
              }
            </div>

            <!-- Notes / Description -->
            <div class="form-group">
              <label for="task-desc">Détails / Instructions (Optionnel)</label>
              <textarea 
                id="task-desc"
                [(ngModel)]="description" 
                name="description"
                rows="2"
                maxlength="1000"
                placeholder="Consignes précises pour votre collaborateur..."
              ></textarea>
            </div>

            <!-- Error Alert -->
            @if (errorMessage()) {
              <div style="color: var(--color-danger); font-size: 0.8rem; font-weight: 700;">
                {{ errorMessage() }}
              </div>
            }

            <div style="flex: 1;"></div>

            <!-- Actions Footer -->
            <div class="drawer-footer">
              <button 
                type="button" 
                class="btn-secondary"
                (click)="store.closeDrawer()">
                Annuler
              </button>
              <button 
                type="submit" 
                class="btn-primary"
                [disabled]="isSubmitting() || !title.trim()">
                @if (isSubmitting()) {
                  Création...
                } @else {
                  Créer la tâche
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styleUrl: './create-task-drawer.component.scss',
})
export class CreateTaskDrawerComponent {
  readonly store = inject(TasksStore);
  private readonly auth = inject(AuthStore);
  private readonly api = inject(TasksApiService);

  title = '';
  description = '';
  priority: TaskPriority = 'NORMAL';
  assignedToUserId = '';
  dueDate = '';
  duePreset = signal<'TODAY' | 'TOMORROW' | 'IN_3_DAYS' | 'NONE'>('TODAY');
  attachments = signal<TaskAttachment[]>([]);
  isSubmitting = signal(false);
  errorMessage = signal<string | null>(null);

  readonly actionSuggestions: ActionSuggestion[] = [
    { label: 'Appeler le tuteur pour accord financier', priority: 'HIGH', icon: 'phone' },
    { label: 'Vérifier la radio panoramique / CBCT', priority: 'NORMAL', icon: 'visibility' },
    { label: 'Relancer le patient pour RDV de contrôle', priority: 'NORMAL', icon: 'calendar_today' },
    { label: 'Préparer entente financière & échéancier', priority: 'HIGH', icon: 'request_quote' },
    { label: 'Valider le plan de traitement aligneurs', priority: 'URGENT', icon: 'check_circle' },
    { label: 'Commander bagues & arcs orthodontiques', priority: 'HIGH', icon: 'shopping_cart' },
    { label: 'Contacter le laboratoire de prothèse', priority: 'NORMAL', icon: 'biotech' },
    { label: 'Envoyer la note d’honoraires acquittée', priority: 'NORMAL', icon: 'receipt' },
  ];

  private staffMembers = signal<StaffOption[]>([]);

  readonly staffOptions = computed(() => {
    const user = this.auth.user();
    const role = this.auth.activeMembership()?.role ?? 'Membre';
    const fallbackSelf: StaffOption = {
      userId: user?.id ?? '',
      name: user ? `${user.firstName} ${user.lastName}`.trim() : 'Moi-même',
      role,
      isSelf: true,
    };

    const loaded = this.staffMembers();
    if (loaded.length > 0) return loaded;
    return [fallbackSelf];
  });

  readonly prefillContext = computed(() => this.store.drawerPrefill()?.context ?? null);

  constructor() {
    this.initForm();
    this.loadClinicStaff();
  }

  private initForm(): void {
    const user = this.auth.user();
    if (user?.id) {
      this.assignedToUserId = user.id;
    }
    this.setDuePreset('TODAY');

    // Apply prefill if present
    const prefill = this.store.drawerPrefill();
    if (prefill?.title) this.title = prefill.title;
    if (prefill?.description) this.description = prefill.description;
    if (prefill?.priority) this.priority = prefill.priority;
    if (prefill?.assignedToUserId) this.assignedToUserId = prefill.assignedToUserId;
    if (prefill?.dueAt) {
      this.dueDate = new Date(prefill.dueAt).toISOString().split('T')[0] ?? '';
    }
    if (prefill?.attachments) {
      this.attachments.set([...prefill.attachments]);
    }
  }

  private async loadClinicStaff(): Promise<void> {
    const clinicId = this.auth.activeMembership()?.clinicId;
    if (!clinicId) return;

    this.api.getClinicMembers(clinicId).subscribe({
      next: (members) => {
        const currentUserId = this.auth.user()?.id;
        const options: StaffOption[] = members.map((m) => ({
          userId: m.userId,
          name: m.user ? `${m.user.firstName} ${m.user.lastName}`.trim() : 'Membre',
          role: m.role,
          isSelf: m.userId === currentUserId,
        }));
        if (options.length > 0) {
          this.staffMembers.set(options);
        }
      },
    });
  }

  selectSuggestion(sug: ActionSuggestion): void {
    this.title = sug.label;
    if (sug.priority) {
      this.priority = sug.priority;
    }
  }

  setDuePreset(preset: 'TODAY' | 'TOMORROW' | 'IN_3_DAYS' | 'NONE'): void {
    this.duePreset.set(preset);
    const now = new Date();

    if (preset === 'TODAY') {
      this.dueDate = now.toISOString().split('T')[0] ?? '';
    } else if (preset === 'TOMORROW') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      this.dueDate = tomorrow.toISOString().split('T')[0] ?? '';
    } else if (preset === 'IN_3_DAYS') {
      const in3 = new Date(now);
      in3.setDate(in3.getDate() + 3);
      this.dueDate = in3.toISOString().split('T')[0] ?? '';
    } else {
      this.dueDate = '';
    }
  }

  isImage(att: TaskAttachment): boolean {
    if (att.mimeType?.startsWith('image/')) return true;
    const lower = (att.name || '').toLowerCase();
    return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp');
  }

  onFileSelected(event: Event): void {
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
        this.attachments.update((current) => [...current, attachment]);
      };
      reader.readAsDataURL(file);
    }
    input.value = '';
  }

  removeAttachment(index: number): void {
    this.attachments.update((current) => current.filter((_, i) => i !== index));
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  async submit(): Promise<void> {
    if (!this.title.trim() || !this.assignedToUserId) {
      this.errorMessage.set('Veuillez renseigner le titre et le responsable de la tâche.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    let dueAtIso: string | null = null;
    if (this.dueDate && this.duePreset() !== 'NONE') {
      const parsed = new Date(this.dueDate);
      parsed.setHours(18, 0, 0, 0); // Standard end of workday
      dueAtIso = parsed.toISOString();
    }

    const payload: CreateTaskInput = {
      title: this.title.trim(),
      description: this.description.trim() || null,
      priority: this.priority,
      assignedToUserId: this.assignedToUserId,
      dueAt: dueAtIso,
      context: this.store.drawerPrefill()?.context ?? null,
      attachments: this.attachments().length > 0 ? this.attachments() : null,
    };

    try {
      await this.store.createTask(payload);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Impossible de créer la tâche');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}

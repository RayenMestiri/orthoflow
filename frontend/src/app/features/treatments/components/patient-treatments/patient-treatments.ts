import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { TreatmentsStore } from '../../data-access/treatments.store';
import {
  formatTreatmentDuration,
  MANUAL_EVENT_TYPES,
  TREATMENT_TYPE_SUGGESTIONS,
  treatmentEventIcon,
  treatmentEventLabel,
  treatmentStatusLabel,
  type TreatmentEventType,
  type TreatmentStatus,
  type TreatmentWithProgress,
} from '../../models/treatment.models';

/**
 * The treatment area of a patient profile.
 *
 * Self-contained on purpose: the patient page adds one tag, and everything from
 * loading to permissions to the forms lives here. It is written as a clinical
 * narrative — what is happening now, what is planned, what already happened —
 * rather than as a CRUD table, because that is how a course of care is read.
 *
 * FUTURE — SCHEDULE INTEGRATION: appointments are deliberately absent. When the
 * two domains are joined, the seam is a visit count and a "next appointment"
 * line on the current-treatment card; nothing here needs restructuring for it.
 */
@Component({
  selector: 'app-patient-treatments',
  imports: [DatePipe, ReactiveFormsModule],
  providers: [TreatmentsStore],
  templateUrl: './patient-treatments.html',
  styleUrl: './patient-treatments.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientTreatments {
  private readonly permissions = inject(PermissionService);
  protected readonly store = inject(TreatmentsStore);

  readonly patientId = input.required<string>();

  protected readonly typeSuggestions = TREATMENT_TYPE_SUGGESTIONS;
  protected readonly eventTypes = MANUAL_EVENT_TYPES;

  protected readonly canManage = this.permissions.can(PERMISSIONS.TREATMENTS_MANAGE);
  protected readonly canLogProgress = this.permissions.can(PERMISSIONS.TREATMENTS_PROGRESS_CREATE);

  protected readonly planOpen = signal(false);
  protected readonly progressOpen = signal(false);
  protected readonly historyOpen = signal(false);
  /** Id of the treatment whose cancellation is being confirmed. */
  protected readonly cancelling = signal<string | null>(null);

  protected readonly current = this.store.currentTreatment;
  protected readonly planned = this.store.plannedTreatments;
  protected readonly past = this.store.pastTreatments;

  /** The timeline shown under the current course, newest first (server order). */
  protected readonly currentProgress = computed(() => this.current()?.progress ?? []);

  protected readonly planForm = new FormGroup({
    treatmentType: new FormControl('Fixed braces', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    startNow: new FormControl(false, { nonNullable: true }),
    startDate: new FormControl('', { nonNullable: true }),
    expectedEndDate: new FormControl('', { nonNullable: true }),
    totalPlannedCost: new FormControl<number | null>(null),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
  });

  protected readonly progressForm = new FormGroup({
    type: new FormControl<TreatmentEventType>('CHECKPOINT', { nonNullable: true }),
    occurredAt: new FormControl(this.todayIso(), { nonNullable: true }),
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
  });

  protected readonly cancelReason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(500)],
  });

  constructor() {
    effect(() => {
      const patientId = this.patientId();
      if (patientId) {
        void this.store.load(patientId);
      }
    });
  }

  protected statusLabel(status: TreatmentStatus): string {
    return treatmentStatusLabel(status);
  }

  protected eventLabel(type: TreatmentEventType): string {
    return treatmentEventLabel(type);
  }

  protected eventIcon(type: TreatmentEventType): string {
    return treatmentEventIcon(type);
  }

  protected duration(treatment: TreatmentWithProgress): string {
    return formatTreatmentDuration(treatment.durationDays);
  }

  protected openPlan(): void {
    this.planForm.reset({
      treatmentType: 'Fixed braces',
      // Only offer to start immediately when the care slot is free.
      startNow: this.current() === null,
      startDate: this.todayIso(),
      expectedEndDate: '',
      totalPlannedCost: null,
      notes: '',
    });
    this.planOpen.set(true);
  }

  protected closePlan(): void {
    if (!this.store.isSaving()) {
      this.planOpen.set(false);
    }
  }

  protected async savePlan(): Promise<void> {
    if (this.planForm.invalid) {
      this.planForm.markAllAsTouched();
      return;
    }

    const value = this.planForm.getRawValue();
    const saved = await this.store.create({
      treatmentType: value.treatmentType.trim(),
      ...(value.startNow ? { status: 'ACTIVE' as const } : {}),
      startDate: value.startDate || null,
      expectedEndDate: value.expectedEndDate || null,
      totalPlannedCost: value.totalPlannedCost,
      notes: value.notes.trim() || null,
    });

    if (saved) {
      this.planOpen.set(false);
    }
  }

  protected openProgress(): void {
    this.progressForm.reset({ type: 'CHECKPOINT', occurredAt: this.todayIso(), note: '' });
    this.progressOpen.set(true);
  }

  protected closeProgress(): void {
    if (!this.store.isSaving()) {
      this.progressOpen.set(false);
    }
  }

  protected async saveProgress(): Promise<void> {
    const treatment = this.current();
    if (!treatment || this.progressForm.invalid) {
      this.progressForm.markAllAsTouched();
      return;
    }

    const value = this.progressForm.getRawValue();
    const saved = await this.store.addProgress(treatment.id, {
      type: value.type,
      // The date input gives a calendar day; the API stores an instant.
      ...(value.occurredAt ? { occurredAt: this.toInstant(value.occurredAt) } : {}),
      note: value.note.trim() || null,
    });

    if (saved) {
      this.progressOpen.set(false);
    }
  }

  protected async start(treatmentId: string): Promise<void> {
    await this.store.start(treatmentId);
  }

  protected async pause(treatmentId: string): Promise<void> {
    await this.store.pause(treatmentId);
  }

  protected async resume(treatmentId: string): Promise<void> {
    await this.store.resume(treatmentId);
  }

  protected async complete(treatmentId: string): Promise<void> {
    await this.store.complete(treatmentId);
  }

  protected openCancel(treatmentId: string): void {
    this.cancelReason.reset('');
    this.cancelling.set(treatmentId);
  }

  protected closeCancel(): void {
    if (!this.store.isSaving()) {
      this.cancelling.set(null);
    }
  }

  protected async confirmCancel(): Promise<void> {
    const treatmentId = this.cancelling();
    if (!treatmentId || this.cancelReason.invalid) {
      this.cancelReason.markAsTouched();
      return;
    }

    if (await this.store.cancel(treatmentId, this.cancelReason.value.trim())) {
      this.cancelling.set(null);
    }
  }

  protected toggleHistory(): void {
    this.historyOpen.update((open) => !open);
  }

  /** `YYYY-MM-DD` for today, which is what a native date input expects. */
  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Turns a picked calendar day into an instant the API accepts.
   *
   * Today becomes "now" rather than midnight, so an entry recorded this
   * afternoon is not rejected as being in the future in a positive-offset zone.
   */
  private toInstant(day: string): string {
    const now = new Date();
    return day === this.todayIso() ? now.toISOString() : new Date(`${day}T12:00:00`).toISOString();
  }
}

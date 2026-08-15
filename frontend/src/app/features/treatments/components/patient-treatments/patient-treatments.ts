import { A11yModule } from '@angular/cdk/a11y';
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
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { ClinicalVisitsApiService } from '../../../clinical-visits/data-access/clinical-visits-api.service';
import { FollowUpsApiService } from '../../../follow-ups/data-access/follow-ups-api.service';
import type { FollowUpRow } from '../../../follow-ups/models/follow-up.models';
import {
  clinicalLabel,
  type ClinicalVisitSummary,
} from '../../../clinical-visits/models/clinical-visit.models';
import { TreatmentsStore } from '../../data-access/treatments.store';
import {
  formatTreatmentDuration,
  MANUAL_MILESTONE_TYPES,
  milestoneIcon,
  milestoneTypeLabel,
  TREATMENT_TYPES,
  treatmentStatusLabel,
  treatmentTypeLabel,
  type TreatmentMilestone,
  type TreatmentMilestoneType,
  type TreatmentStatus,
  type TreatmentType,
  type TreatmentWithMilestones,
} from '../../models/treatment.models';

type DrawerMode = 'create' | 'edit-treatment' | 'add-milestone' | 'edit-milestone';

@Component({
  selector: 'app-patient-treatments',
  imports: [A11yModule, DatePipe, ReactiveFormsModule, RouterLink],
  providers: [TreatmentsStore],
  templateUrl: './patient-treatments.html',
  styleUrl: './patient-treatments.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientTreatments {
  private readonly permissions = inject(PermissionService);
  private readonly clinicalVisitsApi = inject(ClinicalVisitsApiService);
  private readonly followUpsApi = inject(FollowUpsApiService);
  protected readonly store = inject(TreatmentsStore);

  readonly patientId = input.required<string>();
  protected readonly treatmentTypes = TREATMENT_TYPES;
  protected readonly milestoneTypes = MANUAL_MILESTONE_TYPES;
  protected readonly canManage = this.permissions.can(PERMISSIONS.TREATMENTS_MANAGE);
  protected readonly drawerMode = signal<DrawerMode | null>(null);
  protected readonly drawerTreatment = signal<TreatmentWithMilestones | null>(null);
  protected readonly editingMilestone = signal<TreatmentMilestone | null>(null);
  protected readonly historyOpen = signal(false);
  protected readonly cancelling = signal<string | null>(null);
  protected readonly clinicalVisits = signal<ClinicalVisitSummary[]>([]);
  protected readonly followUps = signal<FollowUpRow[]>([]);
  protected readonly clinicalLabel = clinicalLabel;

  protected readonly current = computed(
    () => this.store.selectedTreatment() ?? this.store.featuredTreatment(),
  );
  protected readonly historicalSelection = computed(() => {
    const treatment = this.store.selectedTreatment();
    return treatment?.status === 'COMPLETED' || treatment?.status === 'CANCELLED';
  });
  protected readonly planned = this.store.plannedTreatments;
  protected readonly paused = this.store.pausedTreatments;
  protected readonly past = this.store.pastTreatments;
  protected readonly timeline = computed(() => this.current()?.milestones ?? []);
  protected readonly currentClinicalVisits = computed(() => {
    const treatmentId = this.current()?.id;
    return treatmentId
      ? this.clinicalVisits()
          .filter((visit) => visit.treatmentId === treatmentId)
          .slice(0, 5)
      : [];
  });
  protected readonly currentFollowUp = computed(() => {
    const treatmentId = this.current()?.id;
    return treatmentId
      ? (this.followUps().find((row) => row.treatment?.id === treatmentId) ?? null)
      : null;
  });

  protected readonly treatmentForm = new FormGroup({
    type: new FormControl<TreatmentType>('METAL_BRACES', { nonNullable: true }),
    customTypeLabel: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(80)],
    }),
    status: new FormControl<'PLANNED' | 'ACTIVE'>('PLANNED', { nonNullable: true }),
    startDate: new FormControl('', { nonNullable: true }),
    expectedEndDate: new FormControl('', { nonNullable: true }),
    agreedPrice: new FormControl<number | null>(null, [Validators.min(0)]),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
  });

  protected readonly milestoneForm = new FormGroup({
    type: new FormControl<TreatmentMilestoneType>('CONTROL', { nonNullable: true }),
    title: new FormControl('Control', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
    occurredAt: new FormControl(this.todayIso(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
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
        void this.loadClinicalVisits(patientId);
        void this.loadFollowUps(patientId);
      }
    });
  }

  protected statusLabel(status: TreatmentStatus): string {
    return treatmentStatusLabel(status);
  }

  protected typeLabel(type: TreatmentType, customTypeLabel?: string | null): string {
    return treatmentTypeLabel(type, customTypeLabel);
  }

  protected milestoneLabel(type: TreatmentMilestoneType): string {
    return milestoneTypeLabel(type);
  }

  protected milestoneIcon(type: TreatmentMilestoneType): string {
    return milestoneIcon(type);
  }

  protected duration(treatment: TreatmentWithMilestones): string {
    return formatTreatmentDuration(treatment.durationDays);
  }

  protected formatPrice(value: number | null): string {
    return value === null ? 'Not recorded' : new Intl.NumberFormat('en-US').format(value);
  }

  protected openCreate(): void {
    this.drawerTreatment.set(null);
    this.treatmentForm.reset({
      type: 'METAL_BRACES',
      customTypeLabel: '',
      status: this.store.activeTreatment() ? 'PLANNED' : 'ACTIVE',
      startDate: this.todayIso(),
      expectedEndDate: '',
      agreedPrice: null,
      notes: '',
    });
    this.drawerMode.set('create');
  }

  protected openEdit(treatment: TreatmentWithMilestones): void {
    this.drawerTreatment.set(treatment);
    this.treatmentForm.reset({
      type: treatment.type,
      customTypeLabel: treatment.customTypeLabel ?? '',
      status: treatment.status === 'ACTIVE' ? 'ACTIVE' : 'PLANNED',
      startDate: treatment.startDate ?? '',
      expectedEndDate: treatment.expectedEndDate ?? '',
      agreedPrice: treatment.agreedPrice,
      notes: treatment.notes ?? '',
    });
    this.drawerMode.set('edit-treatment');
  }

  protected openMilestone(treatment: TreatmentWithMilestones): void {
    this.drawerTreatment.set(treatment);
    this.editingMilestone.set(null);
    this.milestoneForm.reset({
      type: 'CONTROL',
      title: 'Control',
      occurredAt: this.todayIso(),
      description: '',
    });
    this.drawerMode.set('add-milestone');
  }

  protected openMilestoneEdit(
    treatment: TreatmentWithMilestones,
    milestone: TreatmentMilestone,
  ): void {
    this.drawerTreatment.set(treatment);
    this.editingMilestone.set(milestone);
    this.milestoneForm.reset({
      type: milestone.type,
      title: milestone.title,
      occurredAt: milestone.occurredAt.slice(0, 10),
      description: milestone.description ?? '',
    });
    this.drawerMode.set('edit-milestone');
  }

  protected closeDrawer(): void {
    if (!this.store.isSaving()) this.drawerMode.set(null);
  }

  protected treatmentTypeChanged(): void {
    if (this.treatmentForm.controls.type.value !== 'OTHER') {
      this.treatmentForm.controls.customTypeLabel.setValue('');
    }
  }

  protected initialStatusChanged(): void {
    if (this.treatmentForm.controls.status.value === 'PLANNED') {
      this.treatmentForm.controls.startDate.setValue('');
    } else if (!this.treatmentForm.controls.startDate.value) {
      this.treatmentForm.controls.startDate.setValue(this.todayIso());
    }
  }

  protected milestoneTypeChanged(): void {
    const type = this.milestoneForm.controls.type.value;
    if (type !== 'CUSTOM') this.milestoneForm.controls.title.setValue(this.milestoneLabel(type));
  }

  protected async saveTreatment(): Promise<void> {
    const value = this.treatmentForm.getRawValue();
    if (value.type === 'OTHER' && !value.customTypeLabel.trim()) {
      this.treatmentForm.controls.customTypeLabel.setErrors({ required: true });
    }
    if (this.treatmentForm.invalid) {
      this.treatmentForm.markAllAsTouched();
      return;
    }
    const editing = this.drawerMode() === 'edit-treatment' ? this.drawerTreatment() : null;
    const common = {
      type: value.type,
      customTypeLabel: value.type === 'OTHER' ? value.customTypeLabel.trim() : null,
      expectedEndDate: value.expectedEndDate || null,
      agreedPrice: value.agreedPrice,
      notes: value.notes.trim() || null,
    };
    const saved = editing
      ? await this.store.update(editing.id, common)
      : await this.store.create({
          ...common,
          status: value.status,
          startDate: value.startDate || null,
        });
    if (saved) this.drawerMode.set(null);
  }

  protected async saveMilestone(): Promise<void> {
    const treatment = this.drawerTreatment();
    if (!treatment || this.milestoneForm.invalid) {
      this.milestoneForm.markAllAsTouched();
      return;
    }
    const value = this.milestoneForm.getRawValue();
    const common = {
      title: value.title.trim(),
      description: value.description.trim() || null,
      occurredAt: this.toInstant(value.occurredAt),
    };
    const milestone = this.editingMilestone();
    const saved = milestone
      ? await this.store.updateMilestone(treatment.id, milestone.id, common)
      : await this.store.addMilestone(treatment.id, { ...common, type: value.type });
    if (saved) this.drawerMode.set(null);
  }

  protected start(treatmentId: string): void {
    void this.store.start(treatmentId);
  }

  protected pause(treatmentId: string): void {
    void this.store.pause(treatmentId);
  }

  protected resume(treatmentId: string): void {
    void this.store.resume(treatmentId);
  }

  protected complete(treatmentId: string): void {
    void this.store.complete(treatmentId);
  }

  protected openCancel(treatmentId: string): void {
    this.cancelReason.reset('');
    this.cancelling.set(treatmentId);
  }

  protected closeCancel(): void {
    if (!this.store.isSaving()) this.cancelling.set(null);
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

  protected viewHistory(treatmentId: string): void {
    this.store.select(treatmentId);
  }

  protected showCurrent(): void {
    this.store.select(null);
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async loadClinicalVisits(patientId: string): Promise<void> {
    try {
      this.clinicalVisits.set(
        await firstValueFrom(this.clinicalVisitsApi.listForPatient(patientId)),
      );
    } catch {
      // Treatment management remains usable if the read-only clinical history
      // is temporarily unavailable; the canonical Visits tab offers retry UX.
      this.clinicalVisits.set([]);
    }
  }

  private async loadFollowUps(patientId: string): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.followUpsApi.list({
          page: 1,
          limit: 50,
          filter: 'ALL',
          sort: 'RECENTLY_VISITED',
          patientId,
        }),
      );
      this.followUps.set(result.rows);
    } catch {
      this.followUps.set([]);
    }
  }

  private toInstant(day: string): string {
    const now = new Date();
    return day === this.todayIso() ? now.toISOString() : new Date(`${day}T12:00:00`).toISOString();
  }
}

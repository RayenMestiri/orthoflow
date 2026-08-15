import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, type CanDeactivateFn } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { getApiProblem } from '../../../../core/http/api-error';
import { ClinicalVisitsApiService } from '../../data-access/clinical-visits-api.service';
import {
  CLINICAL_PROCEDURES,
  CLINICAL_REASONS,
  clinicalLabel,
  type ClinicalProcedure,
  type ClinicalReasonCode,
  type ClinicalVisit,
  type ClinicalVisitInput,
} from '../../models/clinical-visit.models';

@Component({
  selector: 'app-clinical-visit-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './clinical-visit-page.html',
  styleUrl: './clinical-visit-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClinicalVisitPage {
  private readonly api = inject(ClinicalVisitsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionService);
  protected readonly visit = signal<ClinicalVisit | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly amending = signal(false);
  protected readonly previousOpen = signal(false);
  protected readonly reasons = CLINICAL_REASONS;
  protected readonly procedureOptions = CLINICAL_PROCEDURES;
  protected readonly label = clinicalLabel;
  protected readonly canAmendCompleted = this.permissions.can(
    PERMISSIONS.CLINICAL_VISITS_EDIT_COMPLETED,
  );
  protected readonly readOnly = computed(
    () => this.visit()?.status === 'COMPLETED' && !this.amending(),
  );

  protected readonly form = new FormGroup({
    reasonCode: new FormControl<ClinicalReasonCode | null>(null),
    reasonOther: new FormControl('', { nonNullable: true }),
    observations: new FormControl('', { nonNullable: true }),
    procedureDetails: new FormControl('', { nonNullable: true }),
    patientInstructions: new FormControl('', { nonNullable: true }),
    doctorNote: new FormControl('', { nonNullable: true }),
    nextVisitRecommendedAt: new FormControl('', { nonNullable: true }),
    nextStepNote: new FormControl('', { nonNullable: true }),
  });
  protected readonly selectedProcedures = signal<ClinicalProcedure[]>([]);

  constructor() {
    void this.load();
  }

  get hasUnsavedChanges(): boolean {
    return this.form.dirty || this.proceduresDirty;
  }
  private proceduresDirty = false;

  @HostListener('window:beforeunload', ['$event'])
  protectBrowserExit(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges && !this.saving()) event.preventDefault();
  }

  protected toggleProcedure(procedure: ClinicalProcedure): void {
    if (this.readOnly()) return;
    this.selectedProcedures.update((selected) =>
      selected.includes(procedure)
        ? selected.filter((item) => item !== procedure)
        : [...selected, procedure],
    );
    this.proceduresDirty = true;
  }

  protected isSelected(procedure: ClinicalProcedure): boolean {
    return this.selectedProcedures().includes(procedure);
  }

  protected startAmendment(): void {
    if (this.canAmendCompleted) this.amending.set(true);
  }

  protected async saveDraft(): Promise<void> {
    const current = this.visit();
    if (!current) return;
    await this.persist(() => this.api.update(current.id, this.payload()), 'Draft saved.');
  }

  protected async complete(): Promise<void> {
    const current = this.visit();
    if (!current || current.status === 'COMPLETED') return;
    await this.persist(
      () => this.api.complete(current.id, this.payload()),
      'Visit completed and appointment closed.',
    );
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const appointmentId = this.route.snapshot.paramMap.get('appointmentId');
      const visitId = this.route.snapshot.paramMap.get('visitId');
      const visit = appointmentId
        ? await firstValueFrom(this.api.ensureForAppointment(appointmentId))
        : await firstValueFrom(this.api.get(visitId ?? ''));
      this.applyVisit(visit);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private async persist(
    operation: () => ReturnType<ClinicalVisitsApiService['update']>,
    message: string,
  ): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      this.applyVisit(await firstValueFrom(operation()));
      this.notice.set(message);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.saving.set(false);
    }
  }

  private applyVisit(visit: ClinicalVisit): void {
    this.visit.set(visit);
    this.selectedProcedures.set([...visit.procedures]);
    this.proceduresDirty = false;
    this.form.reset({
      reasonCode: visit.reasonCode,
      reasonOther: visit.reasonOther ?? '',
      observations: visit.observations ?? '',
      procedureDetails: visit.procedureDetails ?? '',
      patientInstructions: visit.patientInstructions ?? '',
      doctorNote: visit.doctorNote ?? '',
      nextVisitRecommendedAt: visit.nextVisitRecommendedAt?.slice(0, 10) ?? '',
      nextStepNote: visit.nextStepNote ?? '',
    });
    this.amending.set(false);
  }

  private payload(): ClinicalVisitInput {
    const value = this.form.getRawValue();
    const optional = (text: string): string | null => text.trim() || null;
    return {
      reasonCode: value.reasonCode,
      reasonOther: optional(value.reasonOther),
      observations: optional(value.observations),
      procedures: this.selectedProcedures(),
      procedureDetails: optional(value.procedureDetails),
      patientInstructions: optional(value.patientInstructions),
      doctorNote: optional(value.doctorNote),
      nextVisitRecommendedAt: value.nextVisitRecommendedAt
        ? new Date(`${value.nextVisitRecommendedAt}T12:00:00`).toISOString()
        : null,
      nextStepNote: optional(value.nextStepNote),
    };
  }
}

export const clinicalVisitPendingChangesGuard: CanDeactivateFn<ClinicalVisitPage> = (component) =>
  !component.hasUnsavedChanges || window.confirm('Leave without saving this clinical note?');

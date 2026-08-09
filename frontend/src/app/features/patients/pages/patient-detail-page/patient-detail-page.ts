import { A11yModule } from '@angular/cdk/a11y';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { getApiProblem } from '../../../../core/http/api-error';
import { PatientCashRecords } from '../../../cash-records/components/patient-cash-records/patient-cash-records';
import { PatientTreatments } from '../../../treatments/components/patient-treatments/patient-treatments';
import { PatientsApiService } from '../../data-access/patients-api.service';
import type {
  ContactPreference,
  Guardian,
  GuardianInput,
  GuardianRelationship,
  Patient,
  PatientActivity,
} from '../../models/patient.models';

@Component({
  selector: 'app-patient-detail-page',
  imports: [
    A11yModule,
    DatePipe,
    PatientCashRecords,
    PatientTreatments,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './patient-detail-page.html',
  styleUrl: './patient-detail-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientDetailPage {
  private readonly api = inject(PatientsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly permissions = inject(PermissionService);
  readonly patientId = this.route.snapshot.paramMap.get('patientId') ?? '';
  readonly patient = signal<Patient | null>(null);
  readonly guardians = signal<Guardian[]>([]);
  readonly activity = signal<PatientActivity[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(
    this.route.snapshot.queryParamMap.get('guardianWarning')
      ? 'The patient was saved, but the guardian could not be attached. Add them below.'
      : this.route.snapshot.queryParamMap.get('saved')
        ? 'Patient information saved.'
        : null,
  );
  readonly activeView = signal<'overview' | 'activity' | 'treatments' | 'payments'>('overview');
  readonly guardianPanelOpen = signal(false);
  readonly editingGuardian = signal<Guardian | null>(null);
  readonly guardianSaving = signal(false);
  readonly guardianError = signal<string | null>(null);
  readonly archiveOpen = signal(false);
  readonly archiving = signal(false);
  readonly canUpdate = this.permissions.can(PERMISSIONS.PATIENTS_UPDATE);
  readonly canArchive = this.permissions.can(PERMISSIONS.PATIENTS_ARCHIVE);
  /** The front desk sees the patient file but not the clinical treatment area. */
  readonly canViewTreatments = this.permissions.can(PERMISSIONS.TREATMENTS_VIEW);
  readonly canManageTreatments = this.permissions.can(PERMISSIONS.TREATMENTS_MANAGE);
  /** Assistants follow the chair, not the till. */
  readonly canViewPayments = this.permissions.can(PERMISSIONS.CASH_RECORDS_VIEW);
  /** Guardians the payment drawer may offer as the payer. */
  readonly cashRecordGuardians = computed(() =>
    this.guardians().map((guardian) => ({ id: guardian.id, fullName: guardian.fullName })),
  );
  readonly primaryGuardian = computed(
    () => this.guardians().find((guardian) => guardian.isPrimary) ?? null,
  );
  readonly createdBy = computed(
    () =>
      this.activity().find((item) => item.action === 'patient.created')?.actorName ??
      'Clinic team member',
  );

  readonly guardianForm = new FormGroup({
    firstName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    lastName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    relationship: new FormControl<GuardianRelationship>('MOTHER', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(32)] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(254)],
    }),
    isPrimary: new FormControl(false, { nonNullable: true }),
    financiallyResponsible: new FormControl(false, { nonNullable: true }),
    contactPreference: new FormControl<ContactPreference>('NO_PREFERENCE', { nonNullable: true }),
  });

  constructor() {
    void this.load();
  }

  formatBirthDate(value: string | null): string {
    if (!value) return '—';
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return '—';
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }

  formatAddress(patient: Patient): string {
    return [patient.address.line1, patient.address.city].filter(Boolean).join(', ') || '—';
  }

  formatEnumLabel(value: string): string {
    const normalized = value.toLowerCase().replaceAll('_', ' ');
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [patient, guardians, activity] = await Promise.all([
        firstValueFrom(this.api.get(this.patientId)),
        firstValueFrom(this.api.listGuardians(this.patientId)),
        firstValueFrom(this.api.activity(this.patientId)),
      ]);
      this.patient.set(patient);
      this.guardians.set(guardians);
      this.activity.set(activity.items);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  openGuardian(guardian: Guardian | null = null): void {
    this.editingGuardian.set(guardian);
    this.guardianError.set(null);
    this.guardianForm.reset({
      firstName: guardian?.firstName ?? '',
      lastName: guardian?.lastName ?? '',
      relationship: guardian?.relationship ?? 'MOTHER',
      phone: guardian?.phone ?? '',
      email: guardian?.email ?? '',
      isPrimary: guardian?.isPrimary ?? this.guardians().length === 0,
      financiallyResponsible: guardian?.financiallyResponsible ?? false,
      contactPreference: guardian?.contactPreference ?? 'NO_PREFERENCE',
    });
    this.guardianPanelOpen.set(true);
  }

  closeGuardian(): void {
    if (!this.guardianSaving()) this.guardianPanelOpen.set(false);
  }

  async saveGuardian(): Promise<void> {
    if (this.guardianForm.invalid) {
      this.guardianForm.markAllAsTouched();
      return;
    }
    this.guardianSaving.set(true);
    this.guardianError.set(null);
    try {
      const editing = this.editingGuardian();
      const saved = editing
        ? await firstValueFrom(
            this.api.updateGuardian(this.patientId, editing.id, this.guardianPayload()),
          )
        : await firstValueFrom(this.api.createGuardian(this.patientId, this.guardianPayload()));
      this.guardians.update((items) => {
        const normalized = saved.isPrimary
          ? items.map((item) => ({ ...item, isPrimary: false }))
          : items;
        return editing
          ? normalized.map((item) => (item.id === saved.id ? saved : item))
          : [...normalized, saved];
      });
      this.guardianPanelOpen.set(false);
      this.notice.set(
        editing ? 'Guardian information updated.' : 'Guardian added to this patient.',
      );
      const activity = await firstValueFrom(this.api.activity(this.patientId));
      this.activity.set(activity.items);
    } catch (error) {
      this.guardianError.set(getApiProblem(error).message);
    } finally {
      this.guardianSaving.set(false);
    }
  }

  async archive(): Promise<void> {
    this.archiving.set(true);
    try {
      this.patient.set(await firstValueFrom(this.api.archive(this.patientId)));
      this.archiveOpen.set(false);
      this.notice.set('Patient archived. The record remains available in the archived filter.');
      const activity = await firstValueFrom(this.api.activity(this.patientId));
      this.activity.set(activity.items);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
      this.archiveOpen.set(false);
    } finally {
      this.archiving.set(false);
    }
  }

  initials(firstName: string, lastName: string): string {
    return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  }

  actionLabel(action: string): string {
    const labels: Record<string, string> = {
      'patient.created': 'Patient created',
      'patient.updated': 'Patient information updated',
      'patient.archived': 'Patient archived',
      'patient.restored': 'Patient restored',
      'guardian.linked': 'Guardian added',
      'guardian.updated': 'Guardian information updated',
    };
    return labels[action] ?? action.replaceAll('.', ' ');
  }

  relationshipLabel(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ');
  }

  private guardianPayload(): GuardianInput {
    const value = this.guardianForm.getRawValue();
    const clean = (entry: string): string | null => entry.trim() || null;
    return {
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      relationship: value.relationship,
      phone: clean(value.phone),
      email: clean(value.email),
      isPrimary: value.isPrimary,
      financiallyResponsible: value.financiallyResponsible,
      contactPreference: value.contactPreference,
    };
  }
}

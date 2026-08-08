import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../../core/http/api-error';
import { PatientsApiService } from '../../data-access/patients-api.service';
import type {
  ContactPreference,
  GuardianInput,
  GuardianRelationship,
  Patient,
  PatientGender,
  PatientInput,
} from '../../models/patient.models';

const optionalEmail = Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

@Component({
  selector: 'app-patient-editor-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './patient-editor-page.html',
  styleUrl: './patient-editor-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientEditorPage {
  private readonly api = inject(PatientsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly patientId = this.route.snapshot.paramMap.get('patientId');
  readonly editing = this.patientId !== null;
  readonly loading = signal(this.editing);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly guardianEnabled = signal(false);
  readonly title = computed(() => (this.editing ? 'Edit patient' : 'Add a patient'));

  readonly form = new FormGroup({
    firstName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    lastName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    birthDate: new FormControl('', { nonNullable: true }),
    gender: new FormControl<PatientGender>('UNSPECIFIED', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(32)] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [optionalEmail, Validators.maxLength(254)],
    }),
    line1: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
    city: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
    postalCode: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(20)] }),
    country: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
    referenceNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(48)],
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
    status: new FormControl<'ACTIVE' | 'INACTIVE'>('ACTIVE', { nonNullable: true }),
    guardian: new FormGroup({
      firstName: new FormControl('', { nonNullable: true }),
      lastName: new FormControl('', { nonNullable: true }),
      relationship: new FormControl<GuardianRelationship>('MOTHER', { nonNullable: true }),
      phone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(32)] }),
      email: new FormControl('', {
        nonNullable: true,
        validators: [optionalEmail, Validators.maxLength(254)],
      }),
      isPrimary: new FormControl(true, { nonNullable: true }),
      financiallyResponsible: new FormControl(false, { nonNullable: true }),
      contactPreference: new FormControl<ContactPreference>('NO_PREFERENCE', { nonNullable: true }),
    }),
  });

  constructor() {
    if (this.patientId) void this.loadPatient(this.patientId);
  }

  toggleGuardian(): void {
    this.guardianEnabled.update((enabled) => !enabled);
    const guardian = this.form.controls.guardian;
    for (const control of [guardian.controls.firstName, guardian.controls.lastName]) {
      if (this.guardianEnabled()) control.addValidators(Validators.required);
      else control.removeValidators(Validators.required);
      control.updateValueAndValidity();
    }
  }

  async submit(): Promise<void> {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Review the highlighted fields before saving this patient.');
      return;
    }
    this.submitting.set(true);
    try {
      const patientInput = this.patientPayload();
      const patient = this.patientId
        ? await firstValueFrom(this.api.update(this.patientId, patientInput))
        : await firstValueFrom(this.api.create(patientInput));
      let guardianWarning = false;
      if (!this.editing && this.guardianEnabled()) {
        try {
          await firstValueFrom(this.api.createGuardian(patient.id, this.guardianPayload()));
        } catch {
          guardianWarning = true;
        }
      }
      await this.router.navigate(['/app/patients', patient.id], {
        queryParams: { saved: '1', ...(guardianWarning ? { guardianWarning: '1' } : {}) },
      });
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.submitting.set(false);
    }
  }

  private async loadPatient(patientId: string): Promise<void> {
    try {
      const patient = await firstValueFrom(this.api.get(patientId));
      this.patchPatient(patient);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
      this.form.disable();
    } finally {
      this.loading.set(false);
    }
  }

  private patchPatient(patient: Patient): void {
    this.form.patchValue({
      firstName: patient.firstName,
      lastName: patient.lastName,
      birthDate: patient.birthDate ?? '',
      gender: patient.gender,
      phone: patient.phone ?? '',
      email: patient.email ?? '',
      line1: patient.address.line1 ?? '',
      city: patient.address.city ?? '',
      postalCode: patient.address.postalCode ?? '',
      country: patient.address.country ?? '',
      referenceNumber: patient.referenceNumber ?? '',
      notes: patient.notes ?? '',
      status: patient.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    });
  }

  private patientPayload(): PatientInput {
    const value = this.form.getRawValue();
    const clean = (entry: string): string | null => entry.trim() || null;
    return {
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      birthDate: clean(value.birthDate),
      gender: value.gender,
      phone: clean(value.phone),
      email: clean(value.email),
      address: {
        line1: clean(value.line1),
        city: clean(value.city),
        postalCode: clean(value.postalCode),
        country: clean(value.country),
      },
      referenceNumber: clean(value.referenceNumber),
      notes: clean(value.notes),
      ...(this.editing ? { status: value.status } : {}),
    };
  }

  private guardianPayload(): GuardianInput {
    const value = this.form.getRawValue().guardian;
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

import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
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
const optionalPhone = Validators.pattern(/^[+]?[0-9\s().-]{6,32}$/);

function plausiblePastBirthDate(control: AbstractControl): Record<string, boolean> | null {
  if (!control.value) return null;
  const date = new Date(control.value);
  if (isNaN(date.getTime())) return { invalidDate: true };
  const now = Date.now();
  const oldest = now - 120 * 365.25 * 24 * 60 * 60 * 1000;
  if (date.getTime() > now) return { futureDate: true };
  if (date.getTime() < oldest) return { tooOld: true };
  return null;
}

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
    birthDate: new FormControl('', {
      nonNullable: true,
      validators: [plausiblePastBirthDate],
    }),
    gender: new FormControl<PatientGender>('UNSPECIFIED', { nonNullable: true }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [optionalPhone, Validators.maxLength(32)],
    }),
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
      phone: new FormControl('', {
        nonNullable: true,
        validators: [optionalPhone, Validators.maxLength(32)],
      }),
      email: new FormControl('', {
        nonNullable: true,
        validators: [optionalEmail, Validators.maxLength(254)],
      }),
      isPrimary: new FormControl(true, { nonNullable: true }),
      financiallyResponsible: new FormControl(false, { nonNullable: true }),
      contactPreference: new FormControl<ContactPreference>('NO_PREFERENCE', { nonNullable: true }),
    }),
  });

  // Track form value updates via signal
  readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  // Calculate Patient Age and Minor Status
  readonly computedAge = computed(() => {
    const dobStr = this.formValue().birthDate;
    if (!dobStr) return null;
    const dob = new Date(dobStr);
    if (isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    if (age < 0) return null;
    return {
      years: age,
      isMinor: age < 18,
      label: age === 0 ? 'Infant (< 1 yr)' : `${age} yrs • ${age < 18 ? 'Minor' : 'Adult'}`,
    };
  });

  // Calculate Overall Form Completion Progress (Percentage)
  readonly completionPercent = computed(() => {
    const val = this.formValue();
    const fields = [
      Boolean(val.firstName?.trim()),
      Boolean(val.lastName?.trim()),
      Boolean(val.birthDate),
      Boolean(val.gender && val.gender !== 'UNSPECIFIED'),
      Boolean(val.phone?.trim()),
      Boolean(val.email?.trim()),
      Boolean(val.line1?.trim()),
      Boolean(val.city?.trim()),
      Boolean(val.referenceNumber?.trim()),
    ];
    const completedCount = fields.filter(Boolean).length;
    return Math.round((completedCount / fields.length) * 100);
  });

  readonly isPersonalComplete = computed(() => {
    const v = this.formValue();
    return Boolean(v.firstName?.trim() && v.lastName?.trim());
  });

  readonly isContactComplete = computed(() => {
    const v = this.formValue();
    return Boolean(v.phone?.trim() || v.email?.trim() || v.line1?.trim() || v.city?.trim());
  });

  constructor() {
    if (this.patientId) void this.loadPatient(this.patientId);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void this.submit();
    }
  }

  setGender(gender: PatientGender): void {
    this.form.controls.gender.setValue(gender);
    this.form.controls.gender.markAsDirty();
  }

  setGuardianRelationship(rel: GuardianRelationship): void {
    this.form.controls.guardian.controls.relationship.setValue(rel);
  }

  setGuardianContactPref(pref: ContactPreference): void {
    this.form.controls.guardian.controls.contactPreference.setValue(pref);
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

  scrollToSection(sectionId: string): void {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  fillDemoData(): void {
    const firstNames = ['Lucas', 'Emma', 'Sophie', 'Alexandre', 'Camille', 'Liam', 'Inès'];
    const lastNames = ['Bernard', 'Martin', 'Dubois', 'Thomas', 'Moreau', 'Petit', 'Roux'];
    const cities = ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice', 'Nantes', 'Bordeaux'];
    const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
    const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];
    const randomNum = Math.floor(1000 + Math.random() * 9000);

    this.form.patchValue({
      firstName: fn,
      lastName: ln,
      birthDate: '2010-06-15',
      gender: 'FEMALE',
      phone: '+33 6 12 34 56 78',
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`,
      line1: '142 Avenue des Champs-Élysées',
      city: city,
      postalCode: '75008',
      country: 'France',
      referenceNumber: `PT-${randomNum}`,
      notes: 'Patient referred for orthodontic consultation. Prefers afternoon appointments.',
    });

    if (!this.guardianEnabled()) {
      this.toggleGuardian();
    }
    this.form.controls.guardian.patchValue({
      firstName: 'Marie',
      lastName: ln,
      relationship: 'MOTHER',
      phone: '+33 6 98 76 54 32',
      email: `marie.${ln.toLowerCase()}@example.com`,
      isPrimary: true,
      financiallyResponsible: true,
      contactPreference: 'PHONE',
    });
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
      const problem = getApiProblem(error);
      this.error.set(problem.message);
      const details = problem.details as
        | { issues?: { path?: string; message?: string }[] }
        | undefined;
      if (details?.issues && Array.isArray(details.issues)) {
        for (const issue of details.issues) {
          if (issue.path) {
            const ctrl = this.form.get(issue.path);
            if (ctrl) {
              ctrl.setErrors({ serverValidation: issue.message ?? 'Invalid value' });
              ctrl.markAsTouched();
            }
          }
        }
      }
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


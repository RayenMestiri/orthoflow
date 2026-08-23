import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClinicSettingsStore } from '../../data-access/clinic-settings.store';
import type { ClinicCareContinuitySettings } from '../../models/clinic-settings.models';

@Component({
  selector: 'app-settings-care-continuity',
  imports: [ReactiveFormsModule],
  templateUrl: './settings-care-continuity.html',
  styleUrl: '../../pages/settings-page/settings-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsCareContinuity {
  readonly settings = input.required<ClinicCareContinuitySettings>();
  readonly canEdit = input(false);
  protected readonly store = inject(ClinicSettingsStore);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  protected readonly form = this.formBuilder.group({
    treatmentInactivityDays: [60, [Validators.required, Validators.min(14), Validators.max(365)]],
    retentionInactivityDays: [120, [Validators.required, Validators.min(30), Validators.max(730)]],
    missedAppointmentRebookGraceDays: [14, [Validators.required, Validators.min(1), Validators.max(90)]],
  });
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: null });
  protected readonly isDirty = computed(() => {
    this.formValue();
    const value = this.form.getRawValue();
    const current = this.settings();
    return Object.keys(value).some(
      (key) =>
        Number(value[key as keyof typeof value]) !==
        current[key as keyof ClinicCareContinuitySettings],
    );
  });
  protected readonly isSaving = computed(() => this.store.savingSection() === 'care-continuity');
  protected readonly justSaved = computed(() => this.store.savedSection() === 'care-continuity');

  constructor() {
    effect(() => this.reset());
  }

  reset(): void {
    this.form.reset({ ...this.settings() });
    if (!this.canEdit()) this.form.disable({ emitEvent: false });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    await this.store.saveCareContinuity({
      treatmentInactivityDays: Number(value.treatmentInactivityDays),
      retentionInactivityDays: Number(value.retentionInactivityDays),
      missedAppointmentRebookGraceDays: Number(value.missedAppointmentRebookGraceDays),
    });
  }
}

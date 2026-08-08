import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClinicSettingsStore } from '../../data-access/clinic-settings.store';
import {
  MAX_CONCURRENT_CAPACITY,
  SLOT_INTERVAL_OPTIONS,
  type ClinicSchedulingSettings,
} from '../../models/clinic-settings.models';

/**
 * Scheduling policy.
 *
 * These values are stored here and consumed elsewhere: the Schedule module owns
 * capacity checking, slot snapping and overbooking workflow. Nothing in this
 * component enforces anything.
 */
@Component({
  selector: 'app-settings-scheduling',
  imports: [ReactiveFormsModule],
  templateUrl: './settings-scheduling.html',
  styleUrl: '../../pages/settings-page/settings-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsScheduling {
  readonly scheduling = input.required<ClinicSchedulingSettings>();
  readonly canEdit = input(false);

  protected readonly store = inject(ClinicSettingsStore);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  protected readonly slotOptions = SLOT_INTERVAL_OPTIONS;
  protected readonly capacityOptions = Array.from(
    { length: MAX_CONCURRENT_CAPACITY },
    (_, index) => index + 1,
  );

  protected readonly form = this.formBuilder.group({
    slotIntervalMinutes: [15, [Validators.required]],
    defaultAppointmentDurationMinutes: [
      30,
      [Validators.required, Validators.min(5), Validators.max(480)],
    ],
    defaultConcurrentCapacity: [
      2,
      [Validators.required, Validators.min(1), Validators.max(MAX_CONCURRENT_CAPACITY)],
    ],
    allowOwnerOverbooking: [true],
  });

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: null });

  protected readonly isDirty = computed(() => {
    this.formValue();
    const current = this.scheduling();
    const value = this.form.getRawValue();
    return (
      Number(value.slotIntervalMinutes) !== current.slotIntervalMinutes ||
      Number(value.defaultAppointmentDurationMinutes) !==
        current.defaultAppointmentDurationMinutes ||
      Number(value.defaultConcurrentCapacity) !== current.defaultConcurrentCapacity ||
      value.allowOwnerOverbooking !== current.allowOwnerOverbooking
    );
  });

  protected readonly isSaving = computed(() => this.store.savingSection() === 'scheduling');
  protected readonly justSaved = computed(() => this.store.savedSection() === 'scheduling');

  /** Gentle nudge — a duration off the grid renders awkwardly on the calendar. */
  protected readonly durationOffGrid = computed(() => {
    this.formValue();
    const { defaultAppointmentDurationMinutes, slotIntervalMinutes } = this.form.getRawValue();
    return Number(defaultAppointmentDurationMinutes) % Number(slotIntervalMinutes) !== 0;
  });

  constructor() {
    effect(() => this.reset());
  }

  reset(): void {
    this.form.reset({ ...this.scheduling() });
    if (!this.canEdit()) {
      this.form.disable({ emitEvent: false });
    }
  }

  toggleOverbooking(): void {
    const control = this.form.controls.allowOwnerOverbooking;
    control.setValue(!control.value);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    await this.store.saveScheduling({
      // `<select>` yields strings; the API contract is numeric.
      slotIntervalMinutes: Number(value.slotIntervalMinutes),
      defaultAppointmentDurationMinutes: Number(value.defaultAppointmentDurationMinutes),
      defaultConcurrentCapacity: Number(value.defaultConcurrentCapacity),
      allowOwnerOverbooking: value.allowOwnerOverbooking,
    });
  }
}

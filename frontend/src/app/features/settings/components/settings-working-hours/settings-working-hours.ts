import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { ClinicSettingsStore } from '../../data-access/clinic-settings.store';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  WEEKDAY_WORKING_DAYS,
  type Weekday,
  type WeeklyWorkingHours,
} from '../../models/clinic-settings.models';
import {
  cloneWorkingHours,
  formatMinutesAsHours,
  isWeekValid,
  suggestNextPeriod,
  validateWeek,
  weeklyOpenMinutes,
  workingHoursEqual,
} from '../../utils/working-hours.utils';

/**
 * Weekly opening-hours editor.
 *
 * Split shifts are the whole point: a day is a list of periods, so a clinic
 * that closes for lunch is expressed directly rather than being flattened into
 * one long open block.
 *
 * Edits go into a local draft; nothing is persisted until Save.
 */
@Component({
  selector: 'app-settings-working-hours',
  templateUrl: './settings-working-hours.html',
  styleUrls: ['../../pages/settings-page/settings-section.scss', './settings-working-hours.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsWorkingHours {
  readonly workingHours = input.required<WeeklyWorkingHours>();
  readonly canEdit = input(false);

  protected readonly store = inject(ClinicSettingsStore);

  protected readonly weekdays = WEEKDAYS;
  protected readonly weekdayLabels = WEEKDAY_LABELS;

  protected readonly draft = signal<WeeklyWorkingHours>(cloneWorkingHours(EMPTY_WEEK));

  protected readonly validation = computed(() => validateWeek(this.draft()));
  protected readonly isValid = computed(() => isWeekValid(this.draft()));
  protected readonly isDirty = computed(
    () => !workingHoursEqual(this.draft(), this.workingHours()),
  );
  protected readonly isSaving = computed(() => this.store.savingSection() === 'working-hours');
  protected readonly justSaved = computed(() => this.store.savedSection() === 'working-hours');

  protected readonly weeklyTotal = computed(() =>
    formatMinutesAsHours(weeklyOpenMinutes(this.draft())),
  );

  constructor() {
    effect(() => this.reset());
  }

  reset(): void {
    this.draft.set(cloneWorkingHours(this.workingHours()));
  }

  addPeriod(weekday: Weekday): void {
    this.draft.update((week) => {
      const next = cloneWorkingHours(week);
      next[weekday] = [...next[weekday], suggestNextPeriod(next[weekday])];
      return next;
    });
  }

  removePeriod(weekday: Weekday, index: number): void {
    this.draft.update((week) => {
      const next = cloneWorkingHours(week);
      next[weekday] = next[weekday].filter((_, position) => position !== index);
      return next;
    });
  }

  /** Closing a day empties it; reopening restores a sensible default shift. */
  toggleClosed(weekday: Weekday): void {
    this.draft.update((week) => {
      const next = cloneWorkingHours(week);
      next[weekday] = next[weekday].length > 0 ? [] : [suggestNextPeriod([])];
      return next;
    });
  }

  updatePeriod(weekday: Weekday, index: number, field: 'start' | 'end', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draft.update((week) => {
      const next = cloneWorkingHours(week);
      const period = next[weekday][index];
      if (period) {
        next[weekday][index] = { ...period, [field]: value };
      }
      return next;
    });
  }

  /** Fast path for the common case: one weekday pattern across Monday–Friday. */
  copyMondayToWeekdays(): void {
    this.draft.update((week) => {
      const next = cloneWorkingHours(week);
      for (const weekday of WEEKDAY_WORKING_DAYS) {
        next[weekday] = next.monday.map((period) => ({ ...period }));
      }
      return next;
    });
  }

  copyPreviousDay(weekday: Weekday): void {
    const index = WEEKDAYS.indexOf(weekday);
    const previous = WEEKDAYS[index - 1];
    if (!previous) {
      return;
    }
    this.draft.update((week) => {
      const next = cloneWorkingHours(week);
      next[weekday] = next[previous].map((period) => ({ ...period }));
      return next;
    });
  }

  protected isFirstDay(weekday: Weekday): boolean {
    return WEEKDAYS.indexOf(weekday) === 0;
  }

  async submit(): Promise<void> {
    if (!this.isValid()) {
      return;
    }
    await this.store.saveWorkingHours(this.draft());
  }
}

/** Placeholder until the first `effect` run copies the real value in. */
const EMPTY_WEEK: WeeklyWorkingHours = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../core/http/api-error';
import type {
  ClinicCareContinuitySettings,
  ClinicSchedulingSettings,
  ClinicSettings,
  SettingsSection,
  UpdateGeneralSettingsInput,
  WeeklyWorkingHours,
} from '../models/clinic-settings.models';
import { ClinicSettingsApiService } from './clinic-settings-api.service';

/**
 * Owns the clinic settings state.
 *
 * Each section saves independently, so a half-finished working-hours edit never
 * blocks a phone-number correction. `saved` drives the transient confirmation
 * and is scoped per section for the same reason.
 */
@Injectable({ providedIn: 'root' })
export class ClinicSettingsStore {
  private readonly api = inject(ClinicSettingsApiService);

  private readonly settingsState = signal<ClinicSettings | null>(null);
  private readonly loadingState = signal(false);
  private readonly savingState = signal<SettingsSection | null>(null);
  private readonly errorState = signal<string | null>(null);
  private readonly savedState = signal<SettingsSection | null>(null);

  private savedTimer: ReturnType<typeof setTimeout> | null = null;

  readonly settings = this.settingsState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();
  readonly savingSection = this.savingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly savedSection = this.savedState.asReadonly();

  readonly isLoaded = computed(() => this.settingsState() !== null);

  async load(force = false): Promise<void> {
    if (this.loadingState() || (this.isLoaded() && !force)) {
      return;
    }
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      this.settingsState.set(await firstValueFrom(this.api.get()));
    } catch (error) {
      this.errorState.set(getApiProblem(error).message);
    } finally {
      this.loadingState.set(false);
    }
  }

  async saveGeneral(input: UpdateGeneralSettingsInput): Promise<boolean> {
    return this.save('general', () => this.api.updateGeneral(input));
  }

  async saveWorkingHours(workingHours: WeeklyWorkingHours): Promise<boolean> {
    return this.save('working-hours', () => this.api.updateWorkingHours(workingHours));
  }

  async saveScheduling(scheduling: ClinicSchedulingSettings): Promise<boolean> {
    return this.save('scheduling', () => this.api.updateScheduling(scheduling));
  }

  async saveCareContinuity(settings: ClinicCareContinuitySettings): Promise<boolean> {
    return this.save('care-continuity', () => this.api.updateCareContinuity(settings));
  }

  dismissError(): void {
    this.errorState.set(null);
  }

  /** Drops the cached snapshot — used when the active clinic changes. */
  reset(): void {
    this.settingsState.set(null);
    this.errorState.set(null);
    this.savedState.set(null);
  }

  private async save(
    section: SettingsSection,
    request: () => ReturnType<ClinicSettingsApiService['get']>,
  ): Promise<boolean> {
    this.savingState.set(section);
    this.errorState.set(null);
    try {
      // The server returns the whole settings document, so every section stays
      // in sync after any save.
      this.settingsState.set(await firstValueFrom(request()));
      this.flagSaved(section);
      return true;
    } catch (error) {
      this.errorState.set(getApiProblem(error).message);
      return false;
    } finally {
      this.savingState.set(null);
    }
  }

  private flagSaved(section: SettingsSection): void {
    this.savedState.set(section);
    if (this.savedTimer) {
      clearTimeout(this.savedTimer);
    }
    this.savedTimer = setTimeout(() => this.savedState.set(null), 2600);
  }
}

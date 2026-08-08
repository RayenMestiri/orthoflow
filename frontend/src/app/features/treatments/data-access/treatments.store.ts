import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../core/http/api-error';
import type {
  CreateProgressInput,
  CreateTreatmentInput,
  TreatmentWithProgress,
  UpdateTreatmentInput,
} from '../models/treatment.models';
import { TreatmentsApiService } from './treatments-api.service';

/**
 * Owns one patient's treatment history.
 *
 * Scoped to the component rather than the root injector: a treatment list only
 * makes sense inside a patient file, and a store shared across profiles would
 * show the previous patient's care for a frame after navigation.
 *
 * Every mutation reloads the patient's history instead of patching the cached
 * array, because a single write (starting a course) also appends a timeline
 * entry the response does not carry.
 */
@Injectable()
export class TreatmentsStore {
  private readonly api = inject(TreatmentsApiService);

  private readonly patientIdState = signal<string | null>(null);
  private readonly treatmentsState = signal<TreatmentWithProgress[]>([]);
  private readonly loadingState = signal(false);
  private readonly savingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly loadedState = signal(false);

  readonly treatments = this.treatmentsState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();
  readonly isSaving = this.savingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoaded = this.loadedState.asReadonly();

  /** The course occupying the patient's care slot, if any. */
  readonly currentTreatment = computed(
    () => this.treatmentsState().find((treatment) => treatment.isCurrent) ?? null,
  );

  /** Agreed but not yet begun — shown as "up next" rather than as history. */
  readonly plannedTreatments = computed(() =>
    this.treatmentsState().filter((treatment) => treatment.status === 'PLANNED'),
  );

  /** Finished and abandoned courses, newest first. */
  readonly pastTreatments = computed(() =>
    this.treatmentsState().filter(
      (treatment) => treatment.status === 'COMPLETED' || treatment.status === 'CANCELLED',
    ),
  );

  async load(patientId: string, force = false): Promise<void> {
    if (this.patientIdState() !== patientId) {
      // A different patient: drop the previous file before fetching.
      this.patientIdState.set(patientId);
      this.treatmentsState.set([]);
      this.loadedState.set(false);
    } else if (this.loadingState() || (this.loadedState() && !force)) {
      return;
    }

    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      this.treatmentsState.set(await firstValueFrom(this.api.listForPatient(patientId)));
      this.loadedState.set(true);
    } catch (error) {
      this.errorState.set(getApiProblem(error).message);
    } finally {
      this.loadingState.set(false);
    }
  }

  async create(input: CreateTreatmentInput): Promise<boolean> {
    return this.mutate((patientId) => firstValueFrom(this.api.create(patientId, input)));
  }

  async update(treatmentId: string, input: UpdateTreatmentInput): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.update(treatmentId, input)));
  }

  async start(treatmentId: string, startDate?: string): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.start(treatmentId, startDate)));
  }

  async pause(treatmentId: string, reason?: string): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.pause(treatmentId, reason)));
  }

  async resume(treatmentId: string): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.resume(treatmentId)));
  }

  async complete(treatmentId: string, actualEndDate?: string): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.complete(treatmentId, actualEndDate)));
  }

  async cancel(treatmentId: string, reason: string): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.cancel(treatmentId, reason)));
  }

  async addProgress(treatmentId: string, input: CreateProgressInput): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.addProgress(treatmentId, input)));
  }

  dismissError(): void {
    this.errorState.set(null);
  }

  private async mutate(request: (patientId: string) => Promise<unknown>): Promise<boolean> {
    const patientId = this.patientIdState();
    if (!patientId) {
      return false;
    }

    this.savingState.set(true);
    this.errorState.set(null);
    try {
      await request(patientId);
      await this.refresh(patientId);
      return true;
    } catch (error) {
      this.errorState.set(getApiProblem(error).message);
      return false;
    } finally {
      this.savingState.set(false);
    }
  }

  /** Re-reads the history without touching the loading flag, so the list never blanks. */
  private async refresh(patientId: string): Promise<void> {
    this.treatmentsState.set(await firstValueFrom(this.api.listForPatient(patientId)));
    this.loadedState.set(true);
  }
}

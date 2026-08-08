import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../core/http/api-error';
import type {
  CreateMilestoneInput,
  CreateTreatmentInput,
  TreatmentWithMilestones,
  UpdateMilestoneInput,
  UpdateTreatmentInput,
} from '../models/treatment.models';
import { TreatmentsApiService } from './treatments-api.service';

@Injectable()
export class TreatmentsStore {
  private readonly api = inject(TreatmentsApiService);
  private readonly patientIdState = signal<string | null>(null);
  private readonly treatmentsState = signal<TreatmentWithMilestones[]>([]);
  private readonly selectedIdState = signal<string | null>(null);
  private readonly loadingState = signal(false);
  private readonly savingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly loadedState = signal(false);

  readonly treatments = this.treatmentsState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();
  readonly isSaving = this.savingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoaded = this.loadedState.asReadonly();
  readonly activeTreatment = computed(
    () => this.treatmentsState().find((item) => item.status === 'ACTIVE') ?? null,
  );
  readonly featuredTreatment = computed(
    () =>
      this.activeTreatment() ??
      this.treatmentsState().find((item) => item.status === 'PAUSED') ??
      null,
  );
  readonly pausedTreatments = computed(() =>
    this.treatmentsState().filter(
      (item) => item.status === 'PAUSED' && item.id !== this.featuredTreatment()?.id,
    ),
  );
  readonly plannedTreatments = computed(() =>
    this.treatmentsState().filter((item) => item.status === 'PLANNED'),
  );
  readonly pastTreatments = computed(() =>
    this.treatmentsState().filter(
      (item) => item.status === 'COMPLETED' || item.status === 'CANCELLED',
    ),
  );
  readonly selectedTreatment = computed(() => {
    const id = this.selectedIdState();
    return this.treatmentsState().find((item) => item.id === id) ?? null;
  });

  async load(patientId: string, force = false): Promise<void> {
    if (this.patientIdState() !== patientId) {
      this.patientIdState.set(patientId);
      this.treatmentsState.set([]);
      this.selectedIdState.set(null);
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

  select(treatmentId: string | null): void {
    this.selectedIdState.set(treatmentId);
  }

  create(input: CreateTreatmentInput): Promise<boolean> {
    return this.mutate((patientId) => firstValueFrom(this.api.create(patientId, input)));
  }

  update(treatmentId: string, input: UpdateTreatmentInput): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.update(treatmentId, input)));
  }

  start(treatmentId: string, startDate?: string): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.start(treatmentId, startDate)));
  }

  pause(treatmentId: string, reason?: string): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.pause(treatmentId, reason)));
  }

  resume(treatmentId: string): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.resume(treatmentId)));
  }

  complete(treatmentId: string): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.complete(treatmentId)));
  }

  cancel(treatmentId: string, reason: string): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.cancel(treatmentId, reason)));
  }

  addMilestone(treatmentId: string, input: CreateMilestoneInput): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.api.addMilestone(treatmentId, input)));
  }

  updateMilestone(
    treatmentId: string,
    milestoneId: string,
    input: UpdateMilestoneInput,
  ): Promise<boolean> {
    return this.mutate(() =>
      firstValueFrom(this.api.updateMilestone(treatmentId, milestoneId, input)),
    );
  }

  dismissError(): void {
    this.errorState.set(null);
  }

  private async mutate(request: (patientId: string) => Promise<unknown>): Promise<boolean> {
    const patientId = this.patientIdState();
    if (!patientId) return false;
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

  private async refresh(patientId: string): Promise<void> {
    this.treatmentsState.set(await firstValueFrom(this.api.listForPatient(patientId)));
    this.loadedState.set(true);
  }
}

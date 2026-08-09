import { computed, inject, Injectable, signal } from '@angular/core';
import { filter, firstValueFrom, tap } from 'rxjs';
import { getApiProblem } from '../../../core/http/api-error';
import type {
  PatientMedia,
  PatientMediaFilters,
  PatientMediaUploadInput,
  UpdatePatientMediaInput,
} from '../models/patient-media.models';
import { PatientMediaApiService } from './patient-media-api.service';

@Injectable()
export class PatientMediaStore {
  private readonly api = inject(PatientMediaApiService);
  private readonly patientIdState = signal<string | null>(null);
  private readonly itemsState = signal<PatientMedia[]>([]);
  private readonly totalState = signal(0);
  private readonly loadingState = signal(false);
  private readonly savingState = signal(false);
  private readonly loadedState = signal(false);
  private readonly uploadProgressState = signal<number | null>(null);
  private readonly errorState = signal<string | null>(null);
  private filters: PatientMediaFilters = { status: 'ACTIVE', page: 1, limit: 60 };
  private loadRequestId = 0;

  readonly items = this.itemsState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();
  readonly isSaving = this.savingState.asReadonly();
  readonly isLoaded = this.loadedState.asReadonly();
  readonly uploadProgress = this.uploadProgressState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly activeItems = computed(() =>
    this.itemsState().filter((item) => item.status === 'ACTIVE'),
  );

  async load(
    patientId: string,
    filters: PatientMediaFilters = this.filters,
    force = false,
  ): Promise<void> {
    const changedPatient = this.patientIdState() !== patientId;
    const changedFilters = JSON.stringify(filters) !== JSON.stringify(this.filters);
    if (!changedPatient && !changedFilters && this.loadedState() && !force) return;
    if (changedPatient) {
      this.patientIdState.set(patientId);
      this.itemsState.set([]);
      this.totalState.set(0);
      this.loadedState.set(false);
    }
    this.filters = { status: 'ACTIVE', page: 1, limit: 60, ...filters };
    const requestId = ++this.loadRequestId;
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const result = await firstValueFrom(this.api.listForPatient(patientId, this.filters));
      if (requestId !== this.loadRequestId) return;
      this.itemsState.set(result.items);
      this.totalState.set(result.total);
      this.loadedState.set(true);
    } catch (error) {
      if (requestId !== this.loadRequestId) return;
      this.errorState.set(getApiProblem(error).message);
    } finally {
      if (requestId === this.loadRequestId) this.loadingState.set(false);
    }
  }

  async upload(input: PatientMediaUploadInput): Promise<PatientMedia | null> {
    const patientId = this.patientIdState();
    if (!patientId) return null;
    this.savingState.set(true);
    this.uploadProgressState.set(0);
    this.errorState.set(null);
    try {
      const complete = await firstValueFrom(
        this.api.upload(patientId, input).pipe(
          tap((event) => {
            if (event.kind === 'progress') this.uploadProgressState.set(event.progress);
          }),
          filter((event) => event.kind === 'complete'),
        ),
      );
      this.itemsState.update((items) => [complete.media, ...items]);
      this.totalState.update((total) => total + 1);
      return complete.media;
    } catch (error) {
      this.errorState.set(getApiProblem(error).message);
      return null;
    } finally {
      this.savingState.set(false);
      this.uploadProgressState.set(null);
    }
  }

  async update(mediaId: string, input: UpdatePatientMediaInput): Promise<PatientMedia | null> {
    return this.mutate(async () => firstValueFrom(this.api.update(mediaId, input)));
  }

  async archive(mediaId: string, reason: string | null): Promise<PatientMedia | null> {
    return this.mutate(async () => firstValueFrom(this.api.archive(mediaId, reason)), true);
  }

  dismissError(): void {
    this.errorState.set(null);
  }

  private async mutate(
    request: () => Promise<PatientMedia>,
    removeWhenActive = false,
  ): Promise<PatientMedia | null> {
    this.savingState.set(true);
    this.errorState.set(null);
    try {
      const saved = await request();
      if (removeWhenActive && this.filters.status !== 'ARCHIVED') {
        this.itemsState.update((items) => items.filter((item) => item.id !== saved.id));
        this.totalState.update((total) => Math.max(0, total - 1));
      } else {
        this.itemsState.update((items) =>
          items.map((item) => (item.id === saved.id ? saved : item)),
        );
      }
      return saved;
    } catch (error) {
      this.errorState.set(getApiProblem(error).message);
      return null;
    } finally {
      this.savingState.set(false);
    }
  }
}

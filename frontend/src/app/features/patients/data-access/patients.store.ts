import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../core/http/api-error';
import type { Patient, PatientListQuery } from '../models/patient.models';
import { PatientsApiService } from './patients-api.service';

const INITIAL_QUERY: PatientListQuery = {
  page: 1,
  limit: 20,
  search: '',
  status: 'ACTIVE',
  sortBy: 'name',
  sortOrder: 'asc',
};

@Injectable({ providedIn: 'root' })
export class PatientsStore {
  private readonly api = inject(PatientsApiService);
  private readonly itemsState = signal<Patient[]>([]);
  private readonly totalState = signal(0);
  private readonly pagesState = signal(1);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly queryState = signal<PatientListQuery>(INITIAL_QUERY);
  private requestSequence = 0;

  readonly items = this.itemsState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly pages = this.pagesState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly query = this.queryState.asReadonly();
  readonly hasResults = computed(() => this.itemsState().length > 0);

  async load(changes: Partial<PatientListQuery> = {}): Promise<void> {
    const query = { ...this.queryState(), ...changes };
    this.queryState.set(query);
    const sequence = ++this.requestSequence;
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const result = await firstValueFrom(this.api.list(query));
      if (sequence !== this.requestSequence) return;
      this.itemsState.set(result.items);
      this.totalState.set(result.total);
      this.pagesState.set(Math.max(result.pages, 1));
    } catch (error) {
      if (sequence !== this.requestSequence) return;
      this.itemsState.set([]);
      this.totalState.set(0);
      this.pagesState.set(1);
      this.errorState.set(getApiProblem(error).message);
    } finally {
      if (sequence === this.requestSequence) this.loadingState.set(false);
    }
  }

  reset(): void {
    this.queryState.set(INITIAL_QUERY);
    this.itemsState.set([]);
    this.totalState.set(0);
    this.pagesState.set(1);
    this.errorState.set(null);
  }
}

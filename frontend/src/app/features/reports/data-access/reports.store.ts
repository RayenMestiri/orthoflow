import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import { PermissionService, PERMISSIONS } from '../../../core/auth/permissions';
import { getApiProblem } from '../../../core/http/api-error';
import type {
  AppointmentReports,
  CareContinuityReports,
  FinanceReports,
  ReportOverview,
  ReportQuery,
  TreatmentRetentionReports,
} from '../models/reports.models';
import { ReportsApiService } from './reports.api';

export interface ReportSectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function initialState<T>(): ReportSectionState<T> {
  return { data: null, loading: true, error: null };
}

@Injectable({ providedIn: 'root' })
export class ReportsStore {
  private readonly api = inject(ReportsApiService);
  private readonly permissions = inject(PermissionService);
  private requestId = 0;
  private lastQuery: ReportQuery = { preset: 'this-month' };

  readonly overview = signal(initialState<ReportOverview>());
  readonly appointments = signal(initialState<AppointmentReports>());
  readonly treatments = signal(initialState<TreatmentRetentionReports>());
  readonly finance = signal(initialState<FinanceReports>());
  readonly continuity = signal(initialState<CareContinuityReports>());
  readonly refreshing = signal(false);

  readonly canViewOverview = this.permissions.can(PERMISSIONS.CLINICAL_VISITS_VIEW);
  readonly canViewAppointments = this.permissions.can(PERMISSIONS.APPOINTMENTS_VIEW);
  readonly canViewTreatments =
    this.permissions.can(PERMISSIONS.TREATMENTS_VIEW) &&
    this.permissions.can(PERMISSIONS.RETENTION_VIEW);
  readonly canViewFinance = this.permissions.can(PERMISSIONS.CASH_RECORDS_VIEW);
  readonly canViewContinuity =
    this.permissions.can(PERMISSIONS.FOLLOWUPS_VIEW) && this.canViewTreatments;

  async load(query: ReportQuery): Promise<void> {
    const requestId = ++this.requestId;
    this.lastQuery = query;
    this.refreshing.set(true);
    const tasks: Promise<void>[] = [];
    if (this.canViewOverview) tasks.push(this.loadSection(this.overview, this.api.overview(query), requestId));
    if (this.canViewAppointments) {
      tasks.push(this.loadSection(this.appointments, this.api.appointments(query), requestId));
    }
    if (this.canViewTreatments) {
      tasks.push(this.loadSection(this.treatments, this.api.treatmentsRetention(query), requestId));
    }
    if (this.canViewFinance) tasks.push(this.loadSection(this.finance, this.api.finance(query), requestId));
    if (this.canViewContinuity && !this.continuity().data) {
      tasks.push(this.loadSection(this.continuity, this.api.careContinuity(), requestId));
    }
    await Promise.allSettled(tasks);
    if (requestId === this.requestId) this.refreshing.set(false);
  }

  async retry(section: 'overview' | 'appointments' | 'treatments' | 'finance' | 'continuity') {
    const requestId = this.requestId;
    if (section === 'overview') await this.loadSection(this.overview, this.api.overview(this.lastQuery), requestId);
    if (section === 'appointments') {
      await this.loadSection(this.appointments, this.api.appointments(this.lastQuery), requestId);
    }
    if (section === 'treatments') {
      await this.loadSection(this.treatments, this.api.treatmentsRetention(this.lastQuery), requestId);
    }
    if (section === 'finance') await this.loadSection(this.finance, this.api.finance(this.lastQuery), requestId);
    if (section === 'continuity') {
      await this.loadSection(this.continuity, this.api.careContinuity(), requestId);
    }
  }

  private async loadSection<T>(
    target: ReturnType<typeof signal<ReportSectionState<T>>>,
    source: Observable<T>,
    requestId: number,
  ): Promise<void> {
    target.update((state) => ({ ...state, loading: true, error: null }));
    try {
      const data = await firstValueFrom(source);
      if (requestId !== this.requestId) return;
      target.set({ data, loading: false, error: null });
    } catch (error) {
      if (requestId !== this.requestId) return;
      target.update((state) => ({ ...state, loading: false, error: getApiProblem(error).message }));
    }
  }
}

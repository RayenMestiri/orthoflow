import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  AppointmentReports,
  CareContinuityReports,
  FinanceReports,
  ReportOverview,
  ReportQuery,
  TreatmentRetentionReports,
} from '../models/reports.models';

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/reports`;

  private params(query: ReportQuery): HttpParams {
    let params = new HttpParams();
    if (query.preset) params = params.set('preset', query.preset);
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    return params;
  }

  overview(query: ReportQuery): Observable<ReportOverview> {
    return this.get<ReportOverview>('overview', query);
  }

  appointments(query: ReportQuery): Observable<AppointmentReports> {
    return this.get<AppointmentReports>('appointments', query);
  }

  treatmentsRetention(query: ReportQuery): Observable<TreatmentRetentionReports> {
    return this.get<TreatmentRetentionReports>('treatments-retention', query);
  }

  finance(query: ReportQuery): Observable<FinanceReports> {
    return this.get<FinanceReports>('finance', query);
  }

  careContinuity(): Observable<CareContinuityReports> {
    return this.http
      .get<ApiEnvelope<CareContinuityReports>>(`${this.baseUrl}/care-continuity`)
      .pipe(map((response) => response.data));
  }

  private get<T>(path: string, query: ReportQuery): Observable<T> {
    return this.http
      .get<ApiEnvelope<T>>(`${this.baseUrl}/${path}`, { params: this.params(query) })
      .pipe(map((response) => response.data));
  }
}

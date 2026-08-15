import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  ClinicalVisit,
  ClinicalVisitInput,
  ClinicalVisitSummary,
} from '../models/clinical-visit.models';

interface PaginatedEnvelope<T> {
  success: true;
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

@Injectable({ providedIn: 'root' })
export class ClinicalVisitsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  ensureForAppointment(appointmentId: string): Observable<ClinicalVisit> {
    return this.http
      .post<ApiEnvelope<ClinicalVisit>>(
        `${this.baseUrl}/appointments/${appointmentId}/clinical-visit`,
        {},
      )
      .pipe(map((response) => response.data));
  }

  get(visitId: string): Observable<ClinicalVisit> {
    return this.http
      .get<ApiEnvelope<ClinicalVisit>>(`${this.baseUrl}/clinical-visits/${visitId}`)
      .pipe(map((response) => response.data));
  }

  listForPatient(patientId: string): Observable<ClinicalVisitSummary[]> {
    const params = new HttpParams().set('page', 1).set('limit', 50);
    return this.http
      .get<PaginatedEnvelope<ClinicalVisitSummary>>(
        `${this.baseUrl}/patients/${patientId}/clinical-visits`,
        { params },
      )
      .pipe(map((response) => response.data));
  }

  update(visitId: string, input: ClinicalVisitInput): Observable<ClinicalVisit> {
    return this.http
      .patch<ApiEnvelope<ClinicalVisit>>(`${this.baseUrl}/clinical-visits/${visitId}`, input)
      .pipe(map((response) => response.data));
  }

  complete(visitId: string, input: ClinicalVisitInput): Observable<ClinicalVisit> {
    return this.http
      .post<ApiEnvelope<ClinicalVisit>>(
        `${this.baseUrl}/clinical-visits/${visitId}/complete`,
        input,
      )
      .pipe(map((response) => response.data));
  }
}

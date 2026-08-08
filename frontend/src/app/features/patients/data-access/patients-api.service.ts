import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  Guardian,
  GuardianInput,
  PaginatedData,
  Patient,
  PatientActivity,
  PatientInput,
  PatientListQuery,
} from '../models/patient.models';

interface PaginatedEnvelope<T> {
  success: true;
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

@Injectable({ providedIn: 'root' })
export class PatientsApiService {
  private readonly http = inject(HttpClient);
  private readonly patientsUrl = `${inject(API_BASE_URL)}/patients`;

  list(query: PatientListQuery): Observable<PaginatedData<Patient>> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('limit', query.limit)
      .set('status', query.status)
      .set('sortBy', query.sortBy)
      .set('sortOrder', query.sortOrder);
    if (query.search.trim()) params = params.set('search', query.search.trim());
    return this.http
      .get<PaginatedEnvelope<Patient>>(this.patientsUrl, { params })
      .pipe(map((response) => ({ items: response.data, ...response.pagination })));
  }

  get(patientId: string): Observable<Patient> {
    return this.getData<Patient>(`${this.patientsUrl}/${patientId}`);
  }

  create(input: PatientInput): Observable<Patient> {
    return this.http
      .post<ApiEnvelope<Patient>>(this.patientsUrl, input)
      .pipe(map((response) => response.data));
  }

  update(patientId: string, input: Partial<PatientInput>): Observable<Patient> {
    return this.http
      .patch<ApiEnvelope<Patient>>(`${this.patientsUrl}/${patientId}`, input)
      .pipe(map((response) => response.data));
  }

  archive(patientId: string): Observable<Patient> {
    return this.http
      .post<ApiEnvelope<Patient>>(`${this.patientsUrl}/${patientId}/archive`, {})
      .pipe(map((response) => response.data));
  }

  listGuardians(patientId: string): Observable<Guardian[]> {
    return this.getData<Guardian[]>(`${this.patientsUrl}/${patientId}/guardians`);
  }

  createGuardian(patientId: string, input: GuardianInput): Observable<Guardian> {
    return this.http
      .post<ApiEnvelope<Guardian>>(`${this.patientsUrl}/${patientId}/guardians`, input)
      .pipe(map((response) => response.data));
  }

  updateGuardian(
    patientId: string,
    guardianId: string,
    input: Partial<GuardianInput>,
  ): Observable<Guardian> {
    return this.http
      .patch<ApiEnvelope<Guardian>>(
        `${this.patientsUrl}/${patientId}/guardians/${guardianId}`,
        input,
      )
      .pipe(map((response) => response.data));
  }

  activity(patientId: string, page = 1, limit = 20): Observable<PaginatedData<PatientActivity>> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http
      .get<PaginatedEnvelope<PatientActivity>>(`${this.patientsUrl}/${patientId}/activity`, {
        params,
      })
      .pipe(map((response) => ({ items: response.data, ...response.pagination })));
  }

  private getData<T>(url: string): Observable<T> {
    return this.http.get<ApiEnvelope<T>>(url).pipe(map((response) => response.data));
  }
}

import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  Guardian,
  GuardianChild,
  GuardianInput,
  GuardianSearchResult,
  LinkExistingGuardianInput,
  PaginatedData,
  Patient,
  PatientActivity,
  PatientActivityFilter,
  PatientInput,
  PatientListQuery,
  PortalAccessStatus,
} from '../models/patient.models';

interface PaginatedEnvelope<T> {
  success: true;
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

@Injectable({ providedIn: 'root' })
export class PatientsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly patientsUrl = `${this.baseUrl}/patients`;
  private readonly guardiansUrl = `${this.baseUrl}/guardians`;

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

  linkExistingGuardian(patientId: string, input: LinkExistingGuardianInput): Observable<Guardian> {
    return this.http
      .post<ApiEnvelope<Guardian>>(
        `${this.patientsUrl}/${patientId}/guardians/link-existing`,
        input,
      )
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

  makePrimaryGuardian(patientId: string, guardianId: string): Observable<Guardian> {
    return this.http
      .post<ApiEnvelope<Guardian>>(
        `${this.patientsUrl}/${patientId}/guardians/${guardianId}/make-primary`,
        {},
      )
      .pipe(map((response) => response.data));
  }

  unlinkGuardian(patientId: string, guardianId: string): Observable<{ unlinked: boolean }> {
    return this.http
      .delete<ApiEnvelope<{ unlinked: boolean }>>(
        `${this.patientsUrl}/${patientId}/guardians/${guardianId}`,
      )
      .pipe(map((response) => response.data));
  }

  getGuardianChildren(patientId: string, guardianId: string): Observable<GuardianChild[]> {
    return this.getData<GuardianChild[]>(
      `${this.patientsUrl}/${patientId}/guardians/${guardianId}/children`,
    );
  }

  searchGuardians(query = ''): Observable<GuardianSearchResult[]> {
    const params = new HttpParams().set('query', query.trim());
    return this.getData<GuardianSearchResult[]>(`${this.guardiansUrl}/search?${params.toString()}`);
  }

  portalAccessStatus(guardianId: string): Observable<PortalAccessStatus> {
    return this.getData<PortalAccessStatus>(
      `${this.baseUrl}/portal-management/guardians/${guardianId}`,
    );
  }

  invitePortalAccess(
    guardianId: string,
  ): Observable<{ status: string; delivery: 'QUEUED'; expiresAt: string }> {
    return this.http
      .post<ApiEnvelope<{ status: string; delivery: 'QUEUED'; expiresAt: string }>>(
        `${this.baseUrl}/portal-management/guardians/${guardianId}/invite`,
        {},
      )
      .pipe(map((response) => response.data));
  }

  revokePortalAccess(guardianId: string, reason: string): Observable<{ revoked: true }> {
    return this.http
      .post<ApiEnvelope<{ revoked: true }>>(
        `${this.baseUrl}/portal-management/guardians/${guardianId}/revoke`,
        { reason },
      )
      .pipe(map((response) => response.data));
  }

  activity(
    patientId: string,
    page = 1,
    limit = 20,
    filter: PatientActivityFilter = 'ALL',
  ): Observable<PaginatedData<PatientActivity>> {
    const params = new HttpParams().set('page', page).set('limit', limit).set('filter', filter);
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

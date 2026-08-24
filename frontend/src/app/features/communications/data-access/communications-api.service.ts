import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type { CommunicationJob, ProviderStatus } from '../models/communication.models';

interface PaginatedEnvelope<T> {
  success: true;
  data: T[];
  pagination: { total: number };
}

@Injectable({ providedIn: 'root' })
export class CommunicationsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/communications`;

  listForPatient(patientId: string): Observable<CommunicationJob[]> {
    const params = new HttpParams().set('patientId', patientId).set('limit', 100);
    return this.http
      .get<PaginatedEnvelope<CommunicationJob>>(this.baseUrl, { params })
      .pipe(map((response) => response.data));
  }

  providerStatus(): Observable<ProviderStatus> {
    return this.http
      .get<ApiEnvelope<ProviderStatus>>(`${this.baseUrl}/provider-status`)
      .pipe(map((response) => response.data));
  }

  retry(jobId: string): Observable<void> {
    return this.http
      .post<ApiEnvelope<{ queued: true }>>(`${this.baseUrl}/${jobId}/retry`, {})
      .pipe(map(() => undefined));
  }
}

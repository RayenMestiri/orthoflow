import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  CareContinuityResult,
  CareContinuityState,
  FollowUpFilter,
  FollowUpResult,
  FollowUpSort,
} from '../models/follow-up.models';

@Injectable({ providedIn: 'root' })
export class FollowUpsApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/follow-ups`;

  list(query: {
    page: number;
    limit: number;
    filter: FollowUpFilter;
    sort: FollowUpSort;
    search?: string;
    patientId?: string;
    treatmentId?: string;
  }): Observable<FollowUpResult> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('limit', query.limit)
      .set('filter', query.filter)
      .set('sort', query.sort);
    if (query.search) params = params.set('search', query.search);
    if (query.patientId) params = params.set('patientId', query.patientId);
    if (query.treatmentId) params = params.set('treatmentId', query.treatmentId);
    return this.http
      .get<ApiEnvelope<FollowUpResult>>(this.url, { params })
      .pipe(map((response) => response.data));
  }

  listAttention(query: {
    page: number;
    limit: number;
    state?: CareContinuityState;
    search?: string;
  }): Observable<CareContinuityResult> {
    let params = new HttpParams().set('page', query.page).set('limit', query.limit);
    if (query.state) params = params.set('state', query.state);
    if (query.search) params = params.set('search', query.search);
    return this.http
      .get<ApiEnvelope<CareContinuityResult>>(`${this.url}/attention`, { params })
      .pipe(map((response) => response.data));
  }
}

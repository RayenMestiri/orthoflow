import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type { GlobalSearchResponse } from './global-search.models';

@Injectable({ providedIn: 'root' })
export class GlobalSearchApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly searchUrl = `${this.baseUrl}/search`;

  search(query: string, limit = 5): Observable<GlobalSearchResponse> {
    const params = new HttpParams().set('q', query.trim()).set('limit', limit);
    return this.http
      .get<ApiEnvelope<GlobalSearchResponse>>(this.searchUrl, { params })
      .pipe(map((res) => res.data));
  }
}

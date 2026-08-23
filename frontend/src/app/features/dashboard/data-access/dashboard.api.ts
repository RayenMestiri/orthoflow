import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type { DashboardData } from '../models/dashboard.models';

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/dashboard`;

  getDashboard(): Observable<DashboardData> {
    return this.http
      .get<ApiEnvelope<DashboardData>>(this.baseUrl)
      .pipe(map((response) => response.data));
  }
}

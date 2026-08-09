import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  BalanceFilter,
  BalanceSort,
  FinanceActivityEntry,
  FinanceOverview,
  PatientBalance,
} from '../models/finance.models';

interface PaginatedEnvelope<T> {
  success: true;
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface PatientBalancePage {
  items: PatientBalance[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/**
 * Clinic financial operations API — read-only.
 *
 * Recording and cancelling money stays on the cash-records endpoints; this
 * service only reads the aggregated view, so there is deliberately no write
 * method here.
 */
@Injectable({ providedIn: 'root' })
export class FinanceApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_BASE_URL)}/finance`;

  overview(): Observable<FinanceOverview> {
    return this.http
      .get<ApiEnvelope<FinanceOverview>>(`${this.baseUrl}/overview`)
      .pipe(map((response) => response.data));
  }

  patientBalances(query: {
    filter: BalanceFilter;
    sort: BalanceSort;
    search: string;
    page: number;
    limit: number;
  }): Observable<PatientBalancePage> {
    let params = new HttpParams()
      .set('filter', query.filter)
      .set('sort', query.sort)
      .set('page', query.page)
      .set('limit', query.limit);
    if (query.search.trim()) {
      params = params.set('search', query.search.trim());
    }

    return this.http
      .get<PaginatedEnvelope<PatientBalance>>(`${this.baseUrl}/patient-balances`, { params })
      .pipe(map((response) => ({ items: response.data, ...response.pagination })));
  }

  activity(limit = 12): Observable<FinanceActivityEntry[]> {
    return this.http
      .get<
        ApiEnvelope<FinanceActivityEntry[]>
      >(`${this.baseUrl}/activity`, { params: new HttpParams().set('limit', limit) })
      .pipe(map((response) => response.data));
  }
}

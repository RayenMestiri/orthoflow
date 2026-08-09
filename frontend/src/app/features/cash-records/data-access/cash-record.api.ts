import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type { CashRecord, CashRecordFilter, RecordPaymentInput } from '../models/cash-record.model';
import type { FinancialSummary } from '../models/financial-summary.model';
import type { ReceiptDocument } from '../models/receipt.model';

interface PaginatedEnvelope<T> {
  success: true;
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface CashRecordPage {
  items: CashRecord[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/**
 * Cash records API.
 *
 * Every server-owned field is absent from the request bodies here: the clinic,
 * the staff member who received the money, the status and the receipt number
 * all come from the authenticated session. There is no delete method because
 * the backend exposes no delete route.
 */
@Injectable({ providedIn: 'root' })
export class CashRecordApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  listForPatient(
    patientId: string,
    filter: CashRecordFilter = 'ALL',
    page = 1,
    limit = 20,
  ): Observable<CashRecordPage> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (filter !== 'ALL') {
      params = params.set('status', filter);
    }

    return this.http
      .get<PaginatedEnvelope<CashRecord>>(`${this.baseUrl}/patients/${patientId}/cash-records`, {
        params,
      })
      .pipe(map((response) => ({ items: response.data, ...response.pagination })));
  }

  patientSummary(patientId: string): Observable<FinancialSummary> {
    return this.getData<FinancialSummary>(
      `${this.baseUrl}/patients/${patientId}/financial-summary`,
    );
  }

  treatmentSummary(treatmentId: string): Observable<FinancialSummary> {
    return this.getData<FinancialSummary>(
      `${this.baseUrl}/treatments/${treatmentId}/financial-summary`,
    );
  }

  record(patientId: string, input: RecordPaymentInput): Observable<CashRecord> {
    return this.http
      .post<ApiEnvelope<CashRecord>>(`${this.baseUrl}/patients/${patientId}/cash-records`, input)
      .pipe(map((response) => response.data));
  }

  cancel(cashRecordId: string, reason: string): Observable<CashRecord> {
    return this.http
      .post<ApiEnvelope<CashRecord>>(`${this.baseUrl}/cash-records/${cashRecordId}/cancel`, {
        reason,
      })
      .pipe(map((response) => response.data));
  }

  receiptFor(cashRecordId: string): Observable<ReceiptDocument> {
    return this.getData<ReceiptDocument>(`${this.baseUrl}/cash-records/${cashRecordId}/receipt`);
  }

  private getData<T>(url: string): Observable<T> {
    return this.http.get<ApiEnvelope<T>>(url).pipe(map((response) => response.data));
  }
}

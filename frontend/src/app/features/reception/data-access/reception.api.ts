import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type { AppointmentStatus, ReceptionBoard } from '../models/reception.models';

/**
 * Reception API.
 *
 * The board has its own read endpoint, but every *write* goes through the
 * appointment lifecycle endpoints that already exist — reception adds no new
 * way to change an appointment's status, so validation and auditing stay in one
 * place.
 */
@Injectable({ providedIn: 'root' })
export class ReceptionApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  today(): Observable<ReceptionBoard> {
    return this.http
      .get<ApiEnvelope<ReceptionBoard>>(`${this.baseUrl}/reception/today`)
      .pipe(map((response) => response.data));
  }

  /** Reuses `POST /appointments/:id/status` — the existing transition endpoint. */
  changeStatus(appointmentId: string, status: AppointmentStatus): Observable<unknown> {
    return this.http.post<ApiEnvelope<unknown>>(
      `${this.baseUrl}/appointments/${appointmentId}/status`,
      { status },
    );
  }

  /** Reuses `POST /appointments/:id/cancel`, which requires a reason. */
  cancel(appointmentId: string, reason: string): Observable<unknown> {
    return this.http.post<ApiEnvelope<unknown>>(
      `${this.baseUrl}/appointments/${appointmentId}/cancel`,
      { reason },
    );
  }

  /** Reuses the appointment activity timeline for the detail drawer. */
  activity(appointmentId: string): Observable<unknown[]> {
    return this.http
      .get<ApiEnvelope<unknown[]>>(`${this.baseUrl}/appointments/${appointmentId}/activity`)
      .pipe(map((response) => response.data));
  }
}

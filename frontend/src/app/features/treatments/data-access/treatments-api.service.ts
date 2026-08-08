import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  CreateProgressInput,
  CreateTreatmentInput,
  Treatment,
  TreatmentProgressEntry,
  TreatmentWithProgress,
  UpdateTreatmentInput,
} from '../models/treatment.models';

/**
 * Treatment API.
 *
 * The clinic is never sent: the backend derives it from the authenticated
 * membership. The treating doctor is likewise resolved server-side from the
 * clinic owner, so no request here carries a `doctorId`.
 */
@Injectable({ providedIn: 'root' })
export class TreatmentsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** One request returns the whole history with every timeline attached. */
  listForPatient(patientId: string): Observable<TreatmentWithProgress[]> {
    return this.http
      .get<ApiEnvelope<TreatmentWithProgress[]>>(`${this.baseUrl}/patients/${patientId}/treatments`)
      .pipe(map((response) => response.data));
  }

  create(patientId: string, input: CreateTreatmentInput): Observable<Treatment> {
    return this.http
      .post<ApiEnvelope<Treatment>>(`${this.baseUrl}/patients/${patientId}/treatments`, input)
      .pipe(map((response) => response.data));
  }

  update(treatmentId: string, input: UpdateTreatmentInput): Observable<Treatment> {
    return this.http
      .patch<ApiEnvelope<Treatment>>(`${this.treatmentUrl(treatmentId)}`, input)
      .pipe(map((response) => response.data));
  }

  start(treatmentId: string, startDate?: string): Observable<Treatment> {
    return this.action(treatmentId, 'start', startDate ? { startDate } : {});
  }

  pause(treatmentId: string, reason?: string): Observable<Treatment> {
    return this.action(treatmentId, 'pause', reason ? { reason } : {});
  }

  resume(treatmentId: string, note?: string): Observable<Treatment> {
    return this.action(treatmentId, 'resume', note ? { note } : {});
  }

  complete(treatmentId: string, actualEndDate?: string): Observable<Treatment> {
    return this.action(treatmentId, 'complete', actualEndDate ? { actualEndDate } : {});
  }

  cancel(treatmentId: string, reason: string): Observable<Treatment> {
    return this.action(treatmentId, 'cancel', { reason });
  }

  addProgress(treatmentId: string, input: CreateProgressInput): Observable<TreatmentProgressEntry> {
    return this.http
      .post<
        ApiEnvelope<TreatmentProgressEntry>
      >(`${this.treatmentUrl(treatmentId)}/progress`, input)
      .pipe(map((response) => response.data));
  }

  private action(treatmentId: string, verb: string, body: unknown): Observable<Treatment> {
    return this.http
      .post<ApiEnvelope<Treatment>>(`${this.treatmentUrl(treatmentId)}/${verb}`, body)
      .pipe(map((response) => response.data));
  }

  private treatmentUrl(treatmentId: string): string {
    return `${this.baseUrl}/treatments/${treatmentId}`;
  }
}

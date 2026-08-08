import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  CreateMilestoneInput,
  CreateTreatmentInput,
  Treatment,
  TreatmentMilestone,
  TreatmentWithMilestones,
  UpdateMilestoneInput,
  UpdateTreatmentInput,
} from '../models/treatment.models';

@Injectable({ providedIn: 'root' })
export class TreatmentsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  listForPatient(patientId: string): Observable<TreatmentWithMilestones[]> {
    return this.http
      .get<ApiEnvelope<TreatmentWithMilestones[]>>(
        `${this.baseUrl}/patients/${patientId}/treatments`,
      )
      .pipe(map((response) => response.data));
  }

  create(patientId: string, input: CreateTreatmentInput): Observable<Treatment> {
    return this.http
      .post<ApiEnvelope<Treatment>>(`${this.baseUrl}/patients/${patientId}/treatments`, input)
      .pipe(map((response) => response.data));
  }

  update(treatmentId: string, input: UpdateTreatmentInput): Observable<Treatment> {
    return this.http
      .patch<ApiEnvelope<Treatment>>(this.treatmentUrl(treatmentId), input)
      .pipe(map((response) => response.data));
  }

  start(treatmentId: string, startDate?: string): Observable<Treatment> {
    return this.action(treatmentId, 'start', startDate ? { startDate } : {});
  }

  pause(treatmentId: string, reason?: string): Observable<Treatment> {
    return this.action(treatmentId, 'pause', reason ? { reason } : {});
  }

  resume(treatmentId: string): Observable<Treatment> {
    return this.action(treatmentId, 'resume', {});
  }

  complete(treatmentId: string): Observable<Treatment> {
    return this.action(treatmentId, 'complete', {});
  }

  cancel(treatmentId: string, reason: string): Observable<Treatment> {
    return this.action(treatmentId, 'cancel', { reason });
  }

  addMilestone(treatmentId: string, input: CreateMilestoneInput): Observable<TreatmentMilestone> {
    return this.http
      .post<ApiEnvelope<TreatmentMilestone>>(`${this.treatmentUrl(treatmentId)}/milestones`, input)
      .pipe(map((response) => response.data));
  }

  updateMilestone(
    treatmentId: string,
    milestoneId: string,
    input: UpdateMilestoneInput,
  ): Observable<TreatmentMilestone> {
    return this.http
      .patch<ApiEnvelope<TreatmentMilestone>>(
        `${this.treatmentUrl(treatmentId)}/milestones/${milestoneId}`,
        input,
      )
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

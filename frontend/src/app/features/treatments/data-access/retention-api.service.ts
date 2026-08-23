import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type { RetainerInput, RetentionPlan } from '../models/retention.models';

@Injectable({ providedIn: 'root' })
export class RetentionApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  getByTreatment(treatmentId: string): Observable<RetentionPlan | null> {
    return this.http
      .get<ApiEnvelope<RetentionPlan | null>>(`${this.baseUrl}/treatments/${treatmentId}/retention-plan`)
      .pipe(map((response) => response.data));
  }

  create(
    treatmentId: string,
    input: { initialControlRecommendedAt?: string | null; notes?: string | null },
  ): Observable<RetentionPlan> {
    return this.http
      .post<ApiEnvelope<RetentionPlan>>(`${this.baseUrl}/treatments/${treatmentId}/retention-plan`, {
        ...input,
        retainers: [],
      })
      .pipe(map((response) => response.data));
  }

  deliver(planId: string, input: RetainerInput): Observable<RetentionPlan> {
    return this.post(`${planId}/retainers`, input);
  }

  replace(planId: string, retainerId: string, input: RetainerInput): Observable<RetentionPlan> {
    return this.post(`${planId}/retainers/${retainerId}/replace`, input);
  }

  markLost(planId: string, retainerId: string): Observable<RetentionPlan> {
    return this.post(`${planId}/retainers/${retainerId}/lost`, {});
  }

  discontinue(planId: string, retainerId: string): Observable<RetentionPlan> {
    return this.post(`${planId}/retainers/${retainerId}/discontinue`, {});
  }

  complete(planId: string): Observable<RetentionPlan> {
    return this.post(`${planId}/complete`, { reason: null });
  }

  cancel(planId: string): Observable<RetentionPlan> {
    return this.post(`${planId}/cancel`, { reason: null });
  }

  private post(path: string, body: unknown): Observable<RetentionPlan> {
    return this.http
      .post<ApiEnvelope<RetentionPlan>>(`${this.baseUrl}/retention-plans/${path}`, body)
      .pipe(map((response) => response.data));
  }
}

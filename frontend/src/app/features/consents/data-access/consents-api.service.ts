import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  ConsentPreview,
  ConsentSigningSelection,
  ConsentTemplate,
  ConsentTemplateInput,
  SignedConsent,
} from '../models/consent.models';

interface PaginatedEnvelope<T> {
  success: true;
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

@Injectable({ providedIn: 'root' })
export class ConsentsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  listTemplates(filters: { status?: string; category?: string } = {}): Observable<ConsentTemplate[]> {
    return this.http
      .get<PaginatedEnvelope<ConsentTemplate>>(`${this.baseUrl}/consent-templates`, {
        params: { page: 1, limit: 100, ...filters },
      })
      .pipe(map((response) => response.data));
  }

  createTemplate(input: ConsentTemplateInput): Observable<ConsentTemplate> {
    return this.http
      .post<ApiEnvelope<ConsentTemplate>>(`${this.baseUrl}/consent-templates`, input)
      .pipe(map((response) => response.data));
  }

  updateTemplate(id: string, input: Partial<Omit<ConsentTemplateInput, 'code'>>): Observable<ConsentTemplate> {
    return this.http
      .patch<ApiEnvelope<ConsentTemplate>>(`${this.baseUrl}/consent-templates/${id}`, input)
      .pipe(map((response) => response.data));
  }

  createVersion(id: string): Observable<ConsentTemplate> {
    return this.http
      .post<ApiEnvelope<ConsentTemplate>>(`${this.baseUrl}/consent-templates/${id}/versions`, {})
      .pipe(map((response) => response.data));
  }

  activateTemplate(id: string): Observable<ConsentTemplate> {
    return this.templateAction(id, 'activate');
  }

  archiveTemplate(id: string): Observable<ConsentTemplate> {
    return this.templateAction(id, 'archive');
  }

  listPatientConsents(patientId: string): Observable<SignedConsent[]> {
    return this.http
      .get<PaginatedEnvelope<SignedConsent>>(`${this.baseUrl}/patients/${patientId}/consents`, {
        params: { page: 1, limit: 100 },
      })
      .pipe(map((response) => response.data));
  }

  preview(patientId: string, input: ConsentSigningSelection): Observable<ConsentPreview> {
    return this.http
      .post<ApiEnvelope<ConsentPreview>>(`${this.baseUrl}/patients/${patientId}/consents/preview`, input)
      .pipe(map((response) => response.data));
  }

  sign(
    patientId: string,
    input: ConsentSigningSelection,
    signature: File,
    idempotencyKey: string,
  ): Observable<SignedConsent> {
    const form = new FormData();
    form.append('templateId', input.templateId);
    form.append('signerType', input.signerType);
    if (input.guardianId) form.append('guardianId', input.guardianId);
    if (input.treatmentId) form.append('treatmentId', input.treatmentId);
    if (input.retentionPlanId) form.append('retentionPlanId', input.retentionPlanId);
    form.append('idempotencyKey', idempotencyKey);
    form.append('acknowledgement', 'true');
    form.append('signature', signature, signature.name);
    return this.http
      .post<ApiEnvelope<SignedConsent>>(`${this.baseUrl}/patients/${patientId}/consents/sign`, form)
      .pipe(map((response) => response.data));
  }

  downloadPdf(consentId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/consents/${consentId}/pdf`, { responseType: 'blob' });
  }

  revoke(consentId: string, reason: string): Observable<SignedConsent> {
    return this.lifecycleAction(consentId, 'revoke', reason);
  }

  voidConsent(consentId: string, reason: string): Observable<SignedConsent> {
    return this.lifecycleAction(consentId, 'void', reason);
  }

  private templateAction(id: string, action: string): Observable<ConsentTemplate> {
    return this.http
      .post<ApiEnvelope<ConsentTemplate>>(`${this.baseUrl}/consent-templates/${id}/${action}`, {})
      .pipe(map((response) => response.data));
  }

  private lifecycleAction(id: string, action: string, reason: string): Observable<SignedConsent> {
    return this.http
      .post<ApiEnvelope<SignedConsent>>(`${this.baseUrl}/consents/${id}/${action}`, { reason })
      .pipe(map((response) => response.data));
  }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  DocumentSelection,
  DocumentTemplate,
  GeneratedDocument,
  GeneratedDocumentPreview,
} from '../models/generated-document.models';

interface PaginatedEnvelope<T> {
  success: true;
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}
@Injectable({ providedIn: 'root' })
export class GeneratedDocumentsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  listTemplates(status?: string): Observable<DocumentTemplate[]> {
    return this.http
      .get<PaginatedEnvelope<DocumentTemplate>>(`${this.baseUrl}/document-templates`, {
        params: { page: 1, limit: 100, ...(status ? { status } : {}) },
      })
      .pipe(map((response) => response.data));
  }
  createTemplate(
    input: Pick<DocumentTemplate, 'code' | 'title' | 'category' | 'definition'>,
  ): Observable<DocumentTemplate> {
    return this.http
      .post<ApiEnvelope<DocumentTemplate>>(`${this.baseUrl}/document-templates`, input)
      .pipe(map((response) => response.data));
  }
  updateTemplate(
    id: string,
    input: Partial<Pick<DocumentTemplate, 'title' | 'category' | 'definition'>>,
  ): Observable<DocumentTemplate> {
    return this.http
      .patch<ApiEnvelope<DocumentTemplate>>(`${this.baseUrl}/document-templates/${id}`, input)
      .pipe(map((response) => response.data));
  }
  createVersion(id: string): Observable<DocumentTemplate> {
    return this.templateAction(id, 'versions');
  }
  activateTemplate(id: string): Observable<DocumentTemplate> {
    return this.templateAction(id, 'activate');
  }
  archiveTemplate(id: string): Observable<DocumentTemplate> {
    return this.templateAction(id, 'archive');
  }
  listPatientDocuments(patientId: string): Observable<GeneratedDocument[]> {
    return this.http
      .get<PaginatedEnvelope<GeneratedDocument>>(
        `${this.baseUrl}/patients/${patientId}/generated-documents`,
        { params: { page: 1, limit: 100 } },
      )
      .pipe(map((response) => response.data));
  }
  preview(patientId: string, input: DocumentSelection): Observable<GeneratedDocumentPreview> {
    return this.http
      .post<ApiEnvelope<GeneratedDocumentPreview>>(
        `${this.baseUrl}/patients/${patientId}/generated-documents/preview`,
        input,
      )
      .pipe(map((response) => response.data));
  }
  finalize(
    patientId: string,
    input: DocumentSelection & { previewDigest: string; idempotencyKey: string },
  ): Observable<GeneratedDocument> {
    return this.http
      .post<ApiEnvelope<GeneratedDocument>>(
        `${this.baseUrl}/patients/${patientId}/generated-documents`,
        input,
      )
      .pipe(map((response) => response.data));
  }
  downloadPdf(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/generated-documents/${id}/pdf`, { responseType: 'blob' });
  }
  voidDocument(id: string, reason: string): Observable<GeneratedDocument> {
    return this.http
      .post<ApiEnvelope<GeneratedDocument>>(`${this.baseUrl}/generated-documents/${id}/void`, {
        reason,
      })
      .pipe(map((response) => response.data));
  }
  shareWithGuardian(
    id: string,
    guardianId: string,
  ): Observable<{ guardianId: string; documentId: string; patientId: string; sharedAt: string }> {
    return this.http
      .post<
        ApiEnvelope<{ guardianId: string; documentId: string; patientId: string; sharedAt: string }>
      >(`${this.baseUrl}/portal-management/documents/${id}/share`, { guardianId })
      .pipe(map((response) => response.data));
  }
  private templateAction(id: string, action: string): Observable<DocumentTemplate> {
    return this.http
      .post<ApiEnvelope<DocumentTemplate>>(`${this.baseUrl}/document-templates/${id}/${action}`, {})
      .pipe(map((response) => response.data));
  }
}

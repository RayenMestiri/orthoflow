import { HttpClient, HttpEventType } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { filter, map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  PatientMedia,
  PatientMediaFilters,
  PatientMediaUploadEvent,
  PatientMediaUploadInput,
  UpdatePatientMediaInput,
} from '../models/patient-media.models';

interface PatientMediaListEnvelope {
  success: true;
  data: PatientMedia[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

@Injectable({ providedIn: 'root' })
export class PatientMediaApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  listForPatient(
    patientId: string,
    filters: PatientMediaFilters = {},
  ): Observable<{ items: PatientMedia[]; total: number }> {
    const params: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params[key] = value;
    }
    return this.http
      .get<PatientMediaListEnvelope>(`${this.baseUrl}/patients/${patientId}/media`, { params })
      .pipe(map((response) => ({ items: response.data, total: response.pagination.total })));
  }

  upload(patientId: string, input: PatientMediaUploadInput): Observable<PatientMediaUploadEvent> {
    const form = new FormData();
    form.append('category', input.category);
    form.append('title', input.title);
    if (input.description) form.append('description', input.description);
    if (input.treatmentId) form.append('treatmentId', input.treatmentId);
    if (input.capturedAt) form.append('capturedAt', input.capturedAt);
    form.append('file', input.file, input.file.name);

    return this.http
      .post<ApiEnvelope<PatientMedia>>(`${this.baseUrl}/patients/${patientId}/media/upload`, form, {
        observe: 'events',
        reportProgress: true,
      })
      .pipe(
        map((event): PatientMediaUploadEvent | null => {
          if (event.type === HttpEventType.UploadProgress) {
            const progress = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
            return { kind: 'progress', progress };
          }
          if (event.type === HttpEventType.Response && event.body) {
            return { kind: 'complete', media: event.body.data };
          }
          return null;
        }),
        filter((event): event is PatientMediaUploadEvent => event !== null),
      );
  }

  update(mediaId: string, input: UpdatePatientMediaInput): Observable<PatientMedia> {
    return this.http
      .patch<ApiEnvelope<PatientMedia>>(`${this.baseUrl}/patient-media/${mediaId}`, input)
      .pipe(map((response) => response.data));
  }

  archive(mediaId: string, reason: string | null): Observable<PatientMedia> {
    return this.http
      .post<ApiEnvelope<PatientMedia>>(`${this.baseUrl}/patient-media/${mediaId}/archive`, {
        reason,
      })
      .pipe(map((response) => response.data));
  }
}

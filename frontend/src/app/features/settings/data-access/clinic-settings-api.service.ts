import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  ClinicSchedulingSettings,
  ClinicSettings,
  UpdateGeneralSettingsInput,
  WeeklyWorkingHours,
} from '../models/clinic-settings.models';

/**
 * Clinic settings API.
 *
 * The clinic is never sent: the backend derives it from the authenticated
 * membership (the interceptor's `x-clinic-id` header only *selects* among
 * clinics the caller already belongs to).
 */
@Injectable({ providedIn: 'root' })
export class ClinicSettingsApiService {
  private readonly http = inject(HttpClient);
  private readonly settingsUrl = `${inject(API_BASE_URL)}/clinic/settings`;

  get(): Observable<ClinicSettings> {
    return this.http
      .get<ApiEnvelope<ClinicSettings>>(this.settingsUrl)
      .pipe(map((response) => response.data));
  }

  updateGeneral(input: UpdateGeneralSettingsInput): Observable<ClinicSettings> {
    return this.patch('general', input);
  }

  updateWorkingHours(workingHours: WeeklyWorkingHours): Observable<ClinicSettings> {
    return this.patch('working-hours', { workingHours });
  }

  updateScheduling(scheduling: ClinicSchedulingSettings): Observable<ClinicSettings> {
    return this.patch('scheduling', scheduling);
  }

  private patch(section: string, body: unknown): Observable<ClinicSettings> {
    return this.http
      .patch<ApiEnvelope<ClinicSettings>>(`${this.settingsUrl}/${section}`, body)
      .pipe(map((response) => response.data));
  }
}

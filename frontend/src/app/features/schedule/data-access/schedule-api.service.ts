import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  Appointment,
  AppointmentActivity,
  AppointmentStatus,
  AppointmentType,
  ClinicScheduleSettings,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from '../models/schedule.models';

interface ClinicWithSchedule {
  id: string;
  timezone: string;
  schedule: ClinicScheduleSettings;
}

interface PaginatedEnvelope<T> {
  success: true;
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

@Injectable({ providedIn: 'root' })
export class ScheduleApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  listAppointments(start: string, end: string): Observable<Appointment[]> {
    const params = new HttpParams().set('start', start).set('end', end);
    return this.http
      .get<ApiEnvelope<Appointment[]>>(`${this.baseUrl}/appointments`, { params })
      .pipe(map((response) => response.data));
  }

  createAppointment(input: CreateAppointmentInput): Observable<Appointment> {
    return this.http
      .post<ApiEnvelope<Appointment>>(`${this.baseUrl}/appointments`, input)
      .pipe(map((response) => response.data));
  }

  updateAppointment(appointmentId: string, input: UpdateAppointmentInput): Observable<Appointment> {
    return this.http
      .patch<ApiEnvelope<Appointment>>(`${this.baseUrl}/appointments/${appointmentId}`, input)
      .pipe(map((response) => response.data));
  }

  changeStatus(
    appointmentId: string,
    status: Exclude<AppointmentStatus, 'CANCELLED'>,
  ): Observable<Appointment> {
    return this.http
      .post<ApiEnvelope<Appointment>>(`${this.baseUrl}/appointments/${appointmentId}/status`, {
        status,
      })
      .pipe(map((response) => response.data));
  }

  cancelAppointment(appointmentId: string, reason: string | null): Observable<Appointment> {
    return this.http
      .post<ApiEnvelope<Appointment>>(`${this.baseUrl}/appointments/${appointmentId}/cancel`, {
        reason,
      })
      .pipe(map((response) => response.data));
  }

  listActivity(appointmentId: string): Observable<AppointmentActivity[]> {
    return this.http
      .get<PaginatedEnvelope<AppointmentActivity>>(
        `${this.baseUrl}/appointments/${appointmentId}/activity`,
        { params: new HttpParams().set('page', 1).set('limit', 20) },
      )
      .pipe(map((response) => response.data));
  }

  listAppointmentTypes(): Observable<AppointmentType[]> {
    return this.http
      .get<ApiEnvelope<AppointmentType[]>>(`${this.baseUrl}/appointment-types`)
      .pipe(map((response) => response.data));
  }

  /** The clinic's opening pattern — drives the grid and its slot size. */
  getClinicSchedule(clinicId: string): Observable<ClinicWithSchedule> {
    return this.http
      .get<ApiEnvelope<ClinicWithSchedule>>(`${this.baseUrl}/clinics/${clinicId}`)
      .pipe(map((response) => response.data));
  }
}

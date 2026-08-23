import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  ApiEnvelope,
  PortalAppointment,
  PortalChildOverview,
  PortalChildSummary,
  PortalConsent,
  PortalDocument,
  PortalFinance,
  PortalProfile,
  PortalReceipt,
  PortalSession,
  PortalTokens,
} from '../models/portal.models';

@Injectable({ providedIn: 'root' })
export class PortalApiService {
  private readonly http = inject(HttpClient);
  private readonly root = inject(API_BASE_URL);
  private readonly base = `${this.root}/portal`;
  activate(token: string, password: string): Observable<PortalSession> {
    return this.post<PortalSession>('auth/activate', { token, password });
  }
  login(email: string, password: string): Observable<PortalSession> {
    return this.post<PortalSession>('auth/login', { email, password });
  }
  refresh(): Observable<PortalTokens> {
    return this.post<{ tokens: PortalTokens }>('auth/refresh', {}).pipe(map((v) => v.tokens));
  }
  logout(allDevices = false): Observable<void> {
    return this.post<{ loggedOut: true }>('auth/logout', { allDevices }).pipe(map(() => undefined));
  }
  me(): Observable<PortalProfile> {
    return this.get<PortalProfile>('auth/me');
  }
  children(): Observable<PortalChildSummary[]> {
    return this.get<PortalChildSummary[]>('children');
  }
  overview(id: string): Observable<PortalChildOverview> {
    return this.get<PortalChildOverview>(`children/${id}/overview`);
  }
  appointments(): Observable<PortalAppointment[]> {
    return this.get<PortalAppointment[]>('appointments');
  }
  finance(id: string): Observable<PortalFinance> {
    return this.get<PortalFinance>(`children/${id}/finance`);
  }
  receipt(patientId: string, receiptId: string): Observable<PortalReceipt> {
    return this.get<PortalReceipt>(`children/${patientId}/receipts/${receiptId}`);
  }
  documents(): Observable<PortalDocument[]> {
    return this.get<PortalDocument[]>('documents');
  }
  consents(id: string): Observable<PortalConsent[]> {
    return this.get<PortalConsent[]>(`children/${id}/consents`);
  }
  download(path: string): Observable<Blob> {
    return this.http.get(`${this.root}${path}`, { responseType: 'blob', withCredentials: true });
  }
  private get<T>(path: string): Observable<T> {
    return this.http
      .get<ApiEnvelope<T>>(`${this.base}/${path}`, { withCredentials: true })
      .pipe(map((r) => r.data));
  }
  private post<T>(path: string, body: object): Observable<T> {
    return this.http
      .post<ApiEnvelope<T>>(`${this.base}/${path}`, body, { withCredentials: true })
      .pipe(map((r) => r.data));
  }
}

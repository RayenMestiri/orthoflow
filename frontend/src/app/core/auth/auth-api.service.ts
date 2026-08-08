import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import type {
  ApiEnvelope,
  AuthSessionData,
  AuthTokens,
  CurrentUserData,
  LoginCredentials,
  RegisterClinicOwner,
  RegisterSessionData,
} from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly authUrl = `${this.baseUrl}/auth`;

  login(credentials: LoginCredentials): Observable<AuthSessionData> {
    return this.post<AuthSessionData>('login', credentials);
  }

  register(payload: RegisterClinicOwner): Observable<RegisterSessionData> {
    return this.post<RegisterSessionData>('register', payload);
  }

  refresh(): Observable<AuthTokens> {
    return this.post<{ tokens: AuthTokens }>('refresh', {}).pipe(map((data) => data.tokens));
  }

  currentUser(): Observable<CurrentUserData> {
    return this.http
      .get<ApiEnvelope<CurrentUserData>>(`${this.authUrl}/me`, { withCredentials: true })
      .pipe(map((response) => response.data));
  }

  logout(allDevices = false): Observable<void> {
    return this.post<{ loggedOut: true }>('logout', { allDevices }).pipe(map(() => undefined));
  }

  verifyEmail(email: string, code: string): Observable<void> {
    return this.post<{ verified: true }>('verify-email', { email, code }).pipe(
      map(() => undefined),
    );
  }

  resendVerification(email: string): Observable<void> {
    return this.post<{ accepted: true }>('resend-verification', { email }).pipe(
      map(() => undefined),
    );
  }

  requestPasswordReset(email: string): Observable<void> {
    return this.post<{ accepted: true }>('forgot-password', { email }).pipe(map(() => undefined));
  }

  resetPassword(email: string, code: string, password: string): Observable<void> {
    return this.post<{ passwordReset: true }>('reset-password', { email, code, password }).pipe(
      map(() => undefined),
    );
  }

  private post<T>(path: string, body: object): Observable<T> {
    return this.http
      .post<ApiEnvelope<T>>(`${this.authUrl}/${path}`, body, { withCredentials: true })
      .pipe(map((response) => response.data));
  }
}

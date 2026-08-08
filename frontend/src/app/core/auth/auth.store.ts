import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from './auth-api.service';
import type {
  AuthSessionData,
  AuthStatus,
  AuthUser,
  ClinicMembership,
  LoginCredentials,
  RegisterClinicOwner,
  RegisterSessionData,
} from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApiService);
  private readonly accessTokenState = signal<string | null>(null);
  private readonly userState = signal<AuthUser | null>(null);
  private readonly membershipsState = signal<ClinicMembership[]>([]);
  private readonly statusState = signal<AuthStatus>('unknown');
  private readonly activeClinicIdState = signal<string | null>(null);
  private initialization: Promise<void> | null = null;
  private refreshInFlight: Promise<string | null> | null = null;

  readonly user = this.userState.asReadonly();
  readonly memberships = this.membershipsState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly activeClinicId = this.activeClinicIdState.asReadonly();
  readonly isAuthenticated = computed(() => this.statusState() === 'authenticated');
  readonly activeMembership = computed(
    () =>
      this.membershipsState().find(
        (membership) => membership.clinicId === this.activeClinicIdState(),
      ) ??
      this.membershipsState()[0] ??
      null,
  );

  accessToken(): string | null {
    return this.accessTokenState();
  }

  async login(credentials: LoginCredentials): Promise<AuthSessionData> {
    this.statusState.set('loading');
    try {
      const session = await firstValueFrom(this.api.login(credentials));
      this.applySession(session);
      return session;
    } catch (error) {
      this.clearSession('guest');
      throw error;
    }
  }

  async register(payload: RegisterClinicOwner): Promise<RegisterSessionData> {
    this.statusState.set('loading');
    try {
      const session = await firstValueFrom(this.api.register(payload));
      this.applySession(session);
      this.statusState.set('verification-required');
      return session;
    } catch (error) {
      this.clearSession('guest');
      throw error;
    }
  }

  async verifyEmail(email: string, code: string): Promise<void> {
    await firstValueFrom(this.api.verifyEmail(email, code));
    const current = this.userState();
    if (current && current.email.toLowerCase() === email.toLowerCase()) {
      this.userState.set({ ...current, emailVerified: true });
      this.statusState.set('authenticated');
    }
  }

  async ensureInitialized(): Promise<void> {
    if (this.statusState() !== 'unknown') {
      return;
    }
    this.initialization ??= this.initialize();
    return this.initialization;
  }

  async refreshAccessTokenOnce(): Promise<string | null> {
    this.refreshInFlight ??= firstValueFrom(this.api.refresh())
      .then((tokens) => {
        this.accessTokenState.set(tokens.accessToken);
        return tokens.accessToken;
      })
      .catch(() => {
        this.clearSession('guest');
        return null;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });
    return this.refreshInFlight;
  }

  async logout(allDevices = false): Promise<void> {
    try {
      if (this.accessTokenState()) {
        await firstValueFrom(this.api.logout(allDevices));
      }
    } finally {
      this.clearSession('guest');
    }
  }

  selectClinic(clinicId: string): void {
    if (this.membershipsState().some((membership) => membership.clinicId === clinicId)) {
      this.activeClinicIdState.set(clinicId);
    }
  }

  clearSession(status: AuthStatus = 'guest'): void {
    this.accessTokenState.set(null);
    this.userState.set(null);
    this.membershipsState.set([]);
    this.activeClinicIdState.set(null);
    this.statusState.set(status);
  }

  private async initialize(): Promise<void> {
    this.statusState.set('loading');
    const accessToken = await this.refreshAccessTokenOnce();
    if (!accessToken) {
      return;
    }

    try {
      const current = await firstValueFrom(this.api.currentUser());
      this.userState.set(current.user);
      this.membershipsState.set(current.memberships);
      this.activeClinicIdState.set(current.memberships[0]?.clinicId ?? null);
      this.statusState.set(current.user.emailVerified ? 'authenticated' : 'verification-required');
    } catch {
      this.clearSession('guest');
    }
  }

  private applySession(session: AuthSessionData): void {
    this.accessTokenState.set(session.tokens.accessToken);
    this.userState.set(session.user);
    this.membershipsState.set(session.memberships);
    this.activeClinicIdState.set(session.memberships[0]?.clinicId ?? null);
    this.statusState.set(session.user.emailVerified ? 'authenticated' : 'verification-required');
  }
}

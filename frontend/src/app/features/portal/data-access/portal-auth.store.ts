import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PortalApiService } from './portal-api.service';
import type { PortalProfile, PortalSession } from '../models/portal.models';

type Status = 'unknown' | 'loading' | 'guest' | 'authenticated';
@Injectable({ providedIn: 'root' })
export class PortalAuthStore {
  private readonly api = inject(PortalApiService);
  private readonly tokenState = signal<string | null>(null);
  private readonly profileState = signal<PortalProfile | null>(null);
  private readonly statusState = signal<Status>('unknown');
  private initialization: Promise<void> | null = null;
  private refreshFlight: Promise<string | null> | null = null;
  readonly profile = this.profileState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly authenticated = computed(() => this.statusState() === 'authenticated');
  token(): string | null {
    return this.tokenState();
  }
  async activate(token: string, password: string) {
    return this.apply(await firstValueFrom(this.api.activate(token, password)));
  }
  async login(email: string, password: string) {
    return this.apply(await firstValueFrom(this.api.login(email, password)));
  }
  async ensureInitialized(): Promise<void> {
    this.initialization ??= this.initialize();
    return this.initialization;
  }
  async refreshOnce(): Promise<string | null> {
    this.refreshFlight ??= firstValueFrom(this.api.refresh())
      .then((tokens) => {
        this.tokenState.set(tokens.accessToken);
        return tokens.accessToken;
      })
      .catch(() => {
        this.clear();
        return null;
      })
      .finally(() => (this.refreshFlight = null));
    return this.refreshFlight;
  }
  async logout() {
    try {
      if (this.tokenState()) await firstValueFrom(this.api.logout());
    } finally {
      this.clear();
    }
  }
  clear() {
    this.tokenState.set(null);
    this.profileState.set(null);
    this.statusState.set('guest');
  }
  private apply(session: PortalSession) {
    this.tokenState.set(session.tokens.accessToken);
    this.profileState.set(session.user);
    this.statusState.set('authenticated');
    return session;
  }
  private async initialize() {
    this.statusState.set('loading');
    if (!(await this.refreshOnce())) return;
    try {
      this.profileState.set(await firstValueFrom(this.api.me()));
      this.statusState.set('authenticated');
    } catch {
      this.clear();
    }
  }
}

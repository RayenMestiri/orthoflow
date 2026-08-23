import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../core/http/api-error';
import type { DashboardData } from '../models/dashboard.models';
import { DashboardApiService } from './dashboard.api';

@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly api = inject(DashboardApiService);

  readonly data = signal<DashboardData | null>(null);
  readonly loading = signal<boolean>(true);
  readonly refreshing = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly lastRefreshedAt = signal<Date | null>(null);

  private inFlight = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  async load(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    if (!this.data()) {
      this.loading.set(true);
    } else {
      this.refreshing.set(true);
    }
    this.error.set(null);

    try {
      const result = await firstValueFrom(this.api.getDashboard());
      this.data.set(result);
      this.lastRefreshedAt.set(new Date());
    } catch (err) {
      this.error.set(getApiProblem(err).message);
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
      this.inFlight = false;
    }
  }

  async refresh(): Promise<void> {
    return this.load();
  }

  startAutoRefresh(intervalMs = 60_000): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      // Only refresh if document is visible
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void this.load();
      }
    }, intervalMs);
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

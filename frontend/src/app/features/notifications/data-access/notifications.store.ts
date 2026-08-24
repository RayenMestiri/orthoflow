import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../core/http/api-error';
import type {
  NotificationFilter,
  NotificationItem,
  NotificationPagination,
} from '../models/notification.models';
import { NotificationsApiService } from './notifications.api';

const POLL_INTERVAL_MS = 45_000;
const EMPTY_PAGINATION: NotificationPagination = { page: 1, limit: 20, total: 0, pages: 0 };

@Injectable()
export class NotificationsStore {
  private readonly api = inject(NotificationsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly recentState = signal<NotificationItem[]>([]);
  private readonly itemsState = signal<NotificationItem[]>([]);
  private readonly unreadCountState = signal(0);
  private readonly paginationState = signal(EMPTY_PAGINATION);
  private readonly filterState = signal<NotificationFilter>('ALL');
  private readonly loadingState = signal(false);
  private readonly loadingMoreState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private countInFlight = false;
  private mutationVersion = 0;
  private recentRequestId = 0;
  private pageRequestId = 0;
  private poll: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler = () => {
    if (document.visibilityState === 'visible') void this.refreshUnreadCount();
  };

  readonly recent = this.recentState.asReadonly();
  readonly items = this.itemsState.asReadonly();
  readonly unreadCount = this.unreadCountState.asReadonly();
  readonly pagination = this.paginationState.asReadonly();
  readonly filter = this.filterState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly loadingMore = this.loadingMoreState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly hasMore = computed(() => this.paginationState().page < this.paginationState().pages);

  constructor() {
    this.destroyRef.onDestroy(() => this.stopPolling());
  }

  startPolling(): void {
    if (this.poll) return;
    void this.refreshUnreadCount();
    this.poll = setInterval(() => {
      if (document.visibilityState === 'visible') void this.refreshUnreadCount();
    }, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  stopPolling(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }

  async refreshUnreadCount(): Promise<void> {
    if (this.countInFlight) return;
    this.countInFlight = true;
    const version = this.mutationVersion;
    try {
      const count = await firstValueFrom(this.api.unreadCount());
      if (version === this.mutationVersion) this.unreadCountState.set(count);
    } catch {
      // Background polling never clears readable notification state.
    } finally {
      this.countInFlight = false;
    }
  }

  async loadRecent(force = false): Promise<void> {
    if (!force && this.recentState().length > 0) return;
    const requestId = ++this.recentRequestId;
    const version = this.mutationVersion;
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const result = await firstValueFrom(this.api.list(1, 20, 'ALL'));
      if (requestId !== this.recentRequestId || version !== this.mutationVersion) return;
      this.recentState.set(result.items);
    } catch (error) {
      if (requestId === this.recentRequestId) this.errorState.set(getApiProblem(error).message);
    } finally {
      if (requestId === this.recentRequestId) this.loadingState.set(false);
    }
  }

  async loadPage(filter: NotificationFilter = this.filterState(), page = 1): Promise<void> {
    const requestId = ++this.pageRequestId;
    const version = this.mutationVersion;
    this.filterState.set(filter);
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const result = await firstValueFrom(this.api.list(page, 20, filter));
      if (requestId !== this.pageRequestId || version !== this.mutationVersion) return;
      this.itemsState.set(result.items);
      this.paginationState.set(result.pagination);
    } catch (error) {
      if (requestId === this.pageRequestId) this.errorState.set(getApiProblem(error).message);
    } finally {
      if (requestId === this.pageRequestId) this.loadingState.set(false);
    }
  }

  async loadMore(): Promise<void> {
    if (!this.hasMore() || this.loadingMoreState()) return;
    const nextPage = this.paginationState().page + 1;
    const requestId = ++this.pageRequestId;
    const version = this.mutationVersion;
    this.loadingMoreState.set(true);
    try {
      const result = await firstValueFrom(this.api.list(nextPage, 20, this.filterState()));
      if (requestId !== this.pageRequestId || version !== this.mutationVersion) return;
      const known = new Set(this.itemsState().map((item) => item.id));
      this.itemsState.update((items) => [
        ...items,
        ...result.items.filter((item) => !known.has(item.id)),
      ]);
      this.paginationState.set(result.pagination);
    } catch (error) {
      this.errorState.set(getApiProblem(error).message);
    } finally {
      if (requestId === this.pageRequestId) this.loadingMoreState.set(false);
    }
  }

  async markRead(notification: NotificationItem): Promise<NotificationItem> {
    if (notification.readAt) return notification;
    this.mutationVersion += 1;
    const updated = await firstValueFrom(this.api.markRead(notification.id));
    this.replaceItem(updated);
    this.unreadCountState.update((count) => Math.max(0, count - 1));
    return updated;
  }

  async markAllRead(): Promise<void> {
    if (this.unreadCountState() === 0) return;
    this.mutationVersion += 1;
    const result = await firstValueFrom(this.api.markAllRead());
    const apply = (item: NotificationItem): NotificationItem =>
      item.readAt ? item : { ...item, readAt: result.readAt };
    this.recentState.update((items) => items.map(apply));
    this.itemsState.update((items) => items.map(apply));
    this.unreadCountState.set(0);
  }

  private replaceItem(updated: NotificationItem): void {
    const replace = (item: NotificationItem) => (item.id === updated.id ? updated : item);
    this.recentState.update((items) => items.map(replace));
    this.itemsState.update((items) => items.map(replace));
  }
}

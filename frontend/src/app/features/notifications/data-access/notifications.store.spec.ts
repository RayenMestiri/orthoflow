import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '../models/notification.models';
import { NotificationsApiService } from './notifications.api';
import { NotificationsStore } from './notifications.store';

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'notification-1',
    type: 'TASK_ASSIGNED',
    priority: 'NORMAL',
    title: 'New task assigned',
    message: 'Review patient scan',
    context: {
      target: 'TASK',
      patientId: 'patient-1',
      taskId: 'task-1',
      appointmentId: null,
      consentId: null,
      documentId: null,
      treatmentId: null,
      retentionPlanId: null,
    },
    occurredAt: '2026-08-24T09:00:00.000Z',
    readAt: null,
    createdAt: '2026-08-24T09:00:00.000Z',
    ...overrides,
  };
}

function page(items: NotificationItem[], current = 1, pages = 1) {
  return {
    items,
    pagination: { page: current, limit: 20, total: items.length, pages },
  };
}

describe('NotificationsStore', () => {
  let store: NotificationsStore;
  let api: {
    list: ReturnType<typeof vi.fn>;
    unreadCount: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
    markAllRead: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    api = {
      list: vi.fn(() => of(page([item()]))),
      unreadCount: vi.fn(() => of(1)),
      markRead: vi.fn((id: string) => of(item({ id, readAt: '2026-08-24T10:00:00.000Z' }))),
      markAllRead: vi.fn(() => of({ updatedCount: 1, readAt: '2026-08-24T10:00:00.000Z' })),
    };
    TestBed.configureTestingModule({
      providers: [NotificationsStore, { provide: NotificationsApiService, useValue: api }],
    });
    store = TestBed.inject(NotificationsStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('loads a filtered page and appends unique later pages', async () => {
    api.list
      .mockReturnValueOnce(of(page([item()], 1, 2)))
      .mockReturnValueOnce(of(page([item(), item({ id: 'notification-2' })], 2, 2)));

    await store.loadPage('UNREAD', 1);
    await store.loadMore();

    expect(api.list).toHaveBeenNthCalledWith(1, 1, 20, 'UNREAD');
    expect(api.list).toHaveBeenNthCalledWith(2, 2, 20, 'UNREAD');
    expect(store.items().map((entry) => entry.id)).toEqual(['notification-1', 'notification-2']);
  });

  it('polls only once per interval and stops on destroy', async () => {
    store.startPolling();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.unreadCount).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(45_000);
    expect(api.unreadCount).toHaveBeenCalledTimes(2);

    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(api.unreadCount).toHaveBeenCalledTimes(2);
  });

  it('does not let an older count response undo a local read mutation', async () => {
    const pendingCount = new Subject<number>();
    api.unreadCount.mockReturnValueOnce(pendingCount);
    await store.loadRecent();
    store.startPolling();

    await store.markRead(item());
    pendingCount.next(9);
    pendingCount.complete();
    await Promise.resolve();

    expect(store.unreadCount()).toBe(0);
    expect(store.recent()[0]?.readAt).toBe('2026-08-24T10:00:00.000Z');
  });

  it('marks every loaded row read while keeping API failures readable', async () => {
    await store.loadRecent();
    await store.refreshUnreadCount();
    await store.markAllRead();

    expect(store.unreadCount()).toBe(0);
    expect(store.recent().every((entry) => entry.readAt !== null)).toBe(true);

    api.list.mockReturnValueOnce(throwError(() => new Error('offline')));
    await store.loadRecent(true);
    expect(store.recent()).toHaveLength(1);
    expect(store.error()).toBeTruthy();
  });
});

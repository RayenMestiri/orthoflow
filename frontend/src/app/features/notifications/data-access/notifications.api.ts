import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '../../../core/auth/auth.models';
import { API_BASE_URL } from '../../../core/config/api.config';
import type {
  NotificationFilter,
  NotificationItem,
  NotificationPagination,
} from '../models/notification.models';

interface NotificationListEnvelope {
  success: true;
  data: NotificationItem[];
  pagination: NotificationPagination;
}

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/notifications`;

  list(
    page = 1,
    limit = 20,
    filter: NotificationFilter = 'ALL',
  ): Observable<{
    items: NotificationItem[];
    pagination: NotificationPagination;
  }> {
    const params = new HttpParams().set('page', page).set('limit', limit).set('filter', filter);
    return this.http
      .get<NotificationListEnvelope>(this.url, { params })
      .pipe(map((response) => ({ items: response.data, pagination: response.pagination })));
  }

  unreadCount(): Observable<number> {
    return this.http
      .get<ApiEnvelope<{ count: number }>>(`${this.url}/unread-count`)
      .pipe(map((response) => response.data.count));
  }

  markRead(notificationId: string): Observable<NotificationItem> {
    return this.http
      .post<ApiEnvelope<NotificationItem>>(`${this.url}/${notificationId}/read`, {})
      .pipe(map((response) => response.data));
  }

  markAllRead(): Observable<{ updatedCount: number; readAt: string }> {
    return this.http
      .post<ApiEnvelope<{ updatedCount: number; readAt: string }>>(`${this.url}/read-all`, {})
      .pipe(map((response) => response.data));
  }
}

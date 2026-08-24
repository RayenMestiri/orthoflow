import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { NotificationNavigationService } from '../../data-access/notification-navigation.service';
import { NotificationsStore } from '../../data-access/notifications.store';
import type {
  NotificationFilter,
  NotificationItem,
  NotificationType,
} from '../../models/notification.models';

@Component({
  selector: 'app-notifications-page',
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPage implements OnInit {
  readonly store = inject(NotificationsStore);
  private readonly navigation = inject(NotificationNavigationService);

  ngOnInit(): void {
    void this.store.loadPage('ALL', 1);
  }

  setFilter(filter: NotificationFilter): void {
    if (filter !== this.store.filter()) void this.store.loadPage(filter, 1);
  }

  async openItem(item: NotificationItem): Promise<void> {
    try {
      await this.store.markRead(item);
      await this.navigation.open(item);
    } catch {
      // Keep the row available for retry.
    }
  }

  icon(type: NotificationType): string {
    const icons: Record<NotificationType, string> = {
      TASK_ASSIGNED: 'assignment_ind',
      TASK_REASSIGNED: 'swap_horiz',
      TASK_COMPLETED: 'task_alt',
      APPOINTMENT_CANCELLED: 'event_busy',
      APPOINTMENT_NO_SHOW: 'person_off',
      CONSENT_SIGNED: 'draw',
      GENERATED_DOCUMENT_READY: 'description',
      CARE_CONTINUITY_ATTENTION: 'patient_list',
    };
    return icons[type];
  }

  dateLabel(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }
}

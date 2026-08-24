import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicSettingsStore } from '../../../settings/data-access/clinic-settings.store';
import { NotificationNavigationService } from '../../data-access/notification-navigation.service';
import { NotificationsStore } from '../../data-access/notifications.store';
import type { NotificationItem, NotificationType } from '../../models/notification.models';

@Component({
  selector: 'app-notification-center',
  imports: [A11yModule, RouterLink],
  templateUrl: './notification-center.html',
  styleUrl: './notification-center.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationCenter {
  @ViewChild('trigger') private trigger?: ElementRef<HTMLButtonElement>;
  readonly store = inject(NotificationsStore);
  private readonly navigation = inject(NotificationNavigationService);
  private readonly settings = inject(ClinicSettingsStore);
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly open = signal(false);
  readonly badge = computed(() => {
    const count = this.store.unreadCount();
    return count > 99 ? '99+' : String(count);
  });
  readonly accessibleLabel = computed(() => {
    const count = this.store.unreadCount();
    return count === 0 ? 'Notifications, none unread' : `Notifications, ${count} unread`;
  });
  readonly today = computed(() =>
    this.store.recent().filter((item) => this.isToday(item.occurredAt)),
  );
  readonly earlier = computed(() =>
    this.store.recent().filter((item) => !this.isToday(item.occurredAt)),
  );

  constructor() {
    this.store.startPolling();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.close(true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  async toggle(): Promise<void> {
    if (this.open()) {
      this.close(false);
      return;
    }
    this.open.set(true);
    await this.store.loadRecent(true);
  }

  close(restoreFocus: boolean): void {
    this.open.set(false);
    if (restoreFocus) this.trigger?.nativeElement.focus();
  }

  async openItem(item: NotificationItem): Promise<void> {
    try {
      await this.store.markRead(item);
      this.close(false);
      await this.navigation.open(item);
    } catch {
      // The store keeps the item readable; the next explicit action can retry.
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

  timeAgo(value: string): string {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
    if (minutes < 1) return 'Now';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h`;
    const days = Math.floor(hours / 24);
    return `${days} d`;
  }

  private isToday(value: string): boolean {
    const timezone = this.settings.settings()?.general.timezone;
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(timezone ? { timeZone: timezone } : {}),
    };
    const formatter = new Intl.DateTimeFormat('en-CA', options);
    return formatter.format(new Date(value)) === formatter.format(new Date());
  }
}

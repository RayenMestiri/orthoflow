import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth.store';
import { CLINIC_ROLES } from '../../../../core/auth/auth.models';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { formatMinor } from '../../../cash-records/utils/money-format.util';
import { DashboardStore } from '../../data-access/dashboard.store';
import type { DashboardAttentionItem, DashboardRecentActivityItem } from '../../models/dashboard.models';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage implements OnInit, OnDestroy {
  readonly auth = inject(AuthStore);
  readonly store = inject(DashboardStore);
  readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  readonly canViewFinance = computed(() =>
    this.permissions.can(PERMISSIONS.CASH_RECORDS_VIEW),
  );
  /**
   * Strategic financial overview (revenues, collection rate, outstanding balances)
   * is restricted to owners and practitioners. The secretary records payments but
   * does not need the clinic-wide financial picture — it would expose sensitive
   * business data (revenue trends, collection rates) that is owner-level intelligence.
   */
  readonly canViewFinancialOverview = computed(() =>
    this.permissions.can(PERMISSIONS.CLINIC_SETTINGS_MANAGE) ||
    this.permissions.can(PERMISSIONS.CASH_RECORDS_CANCEL),
  );
  readonly canViewAppointments = computed(() =>
    this.permissions.can(PERMISSIONS.APPOINTMENTS_VIEW),
  );
  readonly canViewFollowUps = computed(() =>
    this.permissions.can(PERMISSIONS.FOLLOWUPS_VIEW),
  );

  readonly todayDateString = computed(() => {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  });

  readonly greeting = computed(() => {
    const user = this.auth.user();
    if (!user) return 'Bonjour';
    const role = this.auth.activeMembership()?.role;
    if (
      role === CLINIC_ROLES.CLINIC_OWNER ||
      role === CLINIC_ROLES.ORTHODONTIST ||
      role === CLINIC_ROLES.DENTIST
    ) {
      return `Bonjour, Dr ${user.lastName || user.firstName}`;
    }
    return `Bonjour, ${user.firstName}`;
  });

  readonly doctorTitle = computed(() => {
    const role = this.auth.activeMembership()?.role;
    switch (role) {
      case CLINIC_ROLES.CLINIC_OWNER:
        return 'Praticien titulaire & Responsable du cabinet';
      case CLINIC_ROLES.ORTHODONTIST:
        return 'Orthodontiste';
      case CLINIC_ROLES.DENTIST:
        return 'Chirurgien-dentiste';
      case CLINIC_ROLES.SECRETARY:
        return 'Accueil & Secrétariat clinique';
      case CLINIC_ROLES.ASSISTANT:
        return 'Assistante dentaire';
      default:
        return 'Membre du cabinet';
    }
  });

  ngOnInit(): void {
    void this.store.load();
    this.store.startAutoRefresh(60_000);
  }

  ngOnDestroy(): void {
    this.store.stopAutoRefresh();
  }

  triggerGlobalSearch(): void {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        metaKey: true,
        bubbles: true,
      }),
    );
  }

  formatMoney(amountMinor: number, currency = 'TND'): string {
    return `${formatMinor(amountMinor, currency)} ${currency.toUpperCase()}`;
  }

  formatTime(isoDate: string): string {
    try {
      const d = new Date(isoDate);
      return new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return '';
    }
  }

  formatRelativeTime(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60_000);

      if (diffMins < 1) return "À l'instant";
      if (diffMins < 60) return `Il y a ${diffMins} min`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `Il y a ${diffHours} h`;
      return this.formatTime(isoDate);
    } catch {
      return '';
    }
  }

  initials(fullName: string): string {
    if (!fullName) return 'PT';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  flowGroupLabel(group: string): string {
    switch (group) {
      case 'IN_TREATMENT':
        return 'Au fauteuil';
      case 'WAITING':
        return 'En salle d’attente';
      case 'LATE':
        return 'En retard';
      case 'ARRIVED':
        return 'Arrivé';
      case 'UPCOMING':
        return 'Attendu';
      case 'COMPLETED':
        return 'Terminé';
      default:
        return group;
    }
  }

  flowGroupBadgeClass(group: string): string {
    switch (group) {
      case 'IN_TREATMENT':
        return 'badge-chair';
      case 'WAITING':
        return 'badge-waiting';
      case 'LATE':
        return 'badge-late';
      case 'ARRIVED':
        return 'badge-arrived';
      case 'UPCOMING':
        return 'badge-upcoming';
      case 'COMPLETED':
        return 'badge-completed';
      default:
        return 'badge-default';
    }
  }

  activityIcon(type: DashboardRecentActivityItem['type']): string {
    switch (type) {
      case 'PAYMENT_RECORDED':
        return 'payments';
      case 'PAYMENT_CANCELLED':
        return 'money_off';
      case 'CLINICAL_VISIT_COMPLETED':
        return 'task_alt';
      case 'APPOINTMENT_SCHEDULED':
        return 'event';
      case 'APPOINTMENT_CANCELLED':
        return 'event_busy';
      case 'DOCUMENT_UPLOADED':
        return 'attach_file';
      case 'PATIENT_CREATED':
        return 'person_add';
      default:
        return 'history';
    }
  }

  activityColorClass(type: DashboardRecentActivityItem['type']): string {
    switch (type) {
      case 'PAYMENT_RECORDED':
        return 'icon-green';
      case 'PAYMENT_CANCELLED':
        return 'icon-red';
      case 'CLINICAL_VISIT_COMPLETED':
        return 'icon-teal';
      case 'APPOINTMENT_SCHEDULED':
        return 'icon-blue';
      case 'APPOINTMENT_CANCELLED':
        return 'icon-amber';
      case 'DOCUMENT_UPLOADED':
        return 'icon-purple';
      case 'PATIENT_CREATED':
        return 'icon-pine';
      default:
        return 'icon-slate';
    }
  }

  handleAttentionClick(item: DashboardAttentionItem): void {
    void this.router.navigate(item.actionRoute, {
      queryParams: item.actionQueryParams,
    });
  }
}

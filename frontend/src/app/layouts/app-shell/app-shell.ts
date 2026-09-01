import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthStore } from '../../core/auth/auth.store';
import { CLINIC_ROLES, PLATFORM_ROLES } from '../../core/auth/auth.models';
import { PermissionService, PERMISSIONS } from '../../core/auth/permissions';
import { ClinicSettingsStore } from '../../features/settings/data-access/clinic-settings.store';
import { ActivePatientService } from '../../features/patients/data-access/active-patient.service';
import { GlobalSearchComponent } from '../../shared/components/global-search/global-search.component';
import { NotificationCenter } from '../../features/notifications/components/notification-center/notification-center';
import { NotificationsStore } from '../../features/notifications/data-access/notifications.store';

interface AppNavigationItem {
  label: string;
  icon: string;
  route?: string;
  location?: string;
  visible: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, GlobalSearchComponent, NotificationCenter],
  providers: [NotificationsStore],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionService);
  private readonly settingsStore = inject(ClinicSettingsStore);
  private readonly elementRef = inject(ElementRef);
  readonly auth = inject(AuthStore);

  readonly compact = signal(false);
  readonly navigationOpen = signal(false);
  readonly accountOpen = signal(false);
  readonly commandCenterOpen = signal(false);
  readonly logoFailed = signal(false);

  readonly activePatientService = inject(ActivePatientService);
  readonly currentUrl = signal(this.router.url);

  readonly canManageSettings = computed(() =>
    this.permissions.can(PERMISSIONS.CLINIC_SETTINGS_MANAGE),
  );

  readonly clinicLogoUrl = computed(() => {
    if (this.logoFailed()) return null;
    const settings = this.settingsStore.settings();
    const logo = settings?.general?.logoUrl?.trim();
    return logo ? logo : null;
  });

  readonly initials = computed(() => {
    const user = this.auth.user();
    return user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : 'OF';
  });

  readonly roleLabel = computed(() => {
    if (this.auth.user()?.platformRole === PLATFORM_ROLES.SUPER_ADMIN) {
      return 'Platform administrator';
    }
    const labels = {
      [CLINIC_ROLES.CLINIC_OWNER]: 'Clinic owner',
      [CLINIC_ROLES.ORTHODONTIST]: 'Orthodontist',
      [CLINIC_ROLES.DENTIST]: 'Dentist',
      [CLINIC_ROLES.SECRETARY]: 'Secretary',
      [CLINIC_ROLES.ASSISTANT]: 'Assistant',
    };
    const role = this.auth.activeMembership()?.role;
    return role ? labels[role] : 'OrthoFlow team';
  });

  /** True when the active clinic membership is the SECRETARY role. */
  readonly isSecretary = computed(() =>
    this.auth.activeMembership()?.role === CLINIC_ROLES.SECRETARY,
  );

  readonly navigation = computed<AppNavigationItem[]>(() => [
    { label: 'Dashboard', icon: 'space_dashboard', route: '/app/dashboard', visible: true },
    {
      label: 'Patients',
      icon: 'group',
      route: '/app/patients',
      visible: this.permissions.can(PERMISSIONS.PATIENTS_VIEW),
    },
    {
      label: 'Today',
      icon: 'pending_actions',
      route: '/app/today',
      visible: this.permissions.can(PERMISSIONS.APPOINTMENTS_VIEW),
    },
    {
      label: 'Schedule',
      icon: 'calendar_month',
      route: '/app/schedule',
      visible: this.permissions.can(PERMISSIONS.APPOINTMENTS_VIEW),
    },
    {
      label: 'Follow-ups',
      icon: 'event_repeat',
      route: '/app/follow-ups',
      visible: this.permissions.can(PERMISSIONS.FOLLOWUPS_VIEW),
    },
    {
      label: 'Tasks',
      icon: 'task_alt',
      route: '/app/tasks',
      visible: this.permissions.can(PERMISSIONS.TASKS_VIEW),
    },
    {
      label: 'Cash records',
      icon: 'receipt_long',
      route: '/app/cash-records',
      visible: this.permissions.can(PERMISSIONS.CASH_RECORDS_VIEW),
    },
    {
      label: 'Rapports',
      icon: 'monitoring',
      route: '/app/reports',
      visible: this.permissions.can(PERMISSIONS.REPORTS_VIEW),
    },
    {
      label: 'Settings',
      icon: 'tune',
      route: '/app/settings',
      visible: this.permissions.can(PERMISSIONS.CLINIC_SETTINGS_MANAGE),
    },
  ]);

  readonly currentTab = computed(() => {
    try {
      const url = this.currentUrl();
      const queryIdx = url.indexOf('?');
      if (queryIdx === -1) return 'overview';
      const params = new URLSearchParams(url.substring(queryIdx));
      return params.get('tab') || 'overview';
    } catch {
      return 'overview';
    }
  });

  readonly activePatientNav = computed(() => {
    const url = this.currentUrl();
    const match = url.match(/\/app\/patients\/([a-f0-9]{24}|[a-zA-Z0-9_-]+)/);
    const patientIdFromUrl = match && match[1] !== 'new' ? match[1] : null;
    if (!patientIdFromUrl) return null;

    const active = this.activePatientService.activePatient();
    const patientId = active?.id ?? patientIdFromUrl;
    const patientName = active?.fullName ?? 'Dossier patient';

    return {
      patientId,
      patientName,
      tabs: [
        {
          id: 'overview',
          label: 'Overview',
          icon: 'info',
          visible: true,
        },
        {
          id: 'activity',
          label: 'Historique',
          icon: 'history',
          visible: true,
        },
        {
          id: 'communications',
          label: 'Communications',
          icon: 'forum',
          visible: this.permissions.can(PERMISSIONS.COMMUNICATIONS_VIEW),
        },
        {
          id: 'treatments',
          label: 'Treatment',
          icon: 'medical_services',
          visible: this.permissions.can(PERMISSIONS.TREATMENTS_VIEW),
        },
        {
          id: 'payments',
          label: 'Payments',
          icon: 'receipt_long',
          visible: this.permissions.can(PERMISSIONS.CASH_RECORDS_VIEW),
        },
        {
          id: 'visits',
          label: 'Visits',
          icon: 'edit_note',
          visible: this.permissions.can(PERMISSIONS.CLINICAL_VISITS_VIEW),
        },
        {
          id: 'media',
          label: 'Documents',
          icon: 'folder_open',
          visible: this.permissions.can(PERMISSIONS.PATIENT_MEDIA_VIEW),
        },
        {
          id: 'consents',
          label: 'Consents',
          icon: 'verified_user',
          visible: this.permissions.can(PERMISSIONS.CONSENTS_VIEW),
        },
      ],
    };
  });

  constructor() {
    // Load clinic settings to retrieve saved logo URL
    void this.settingsStore.load();

    this.breakpointObserver
      .observe('(max-width: 64rem)')
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        this.compact.set(state.matches);
        if (!state.matches) {
          this.navigationOpen.set(false);
        }
      });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects || event.url);
        this.closeTransientMenus();
      });
  }

  @HostListener('document:keydown.escape')
  closeTransientMenus(): void {
    this.navigationOpen.set(false);
    this.accountOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.accountOpen()) return;
    const target = event.target as HTMLElement | null;
    const accountEl = this.elementRef.nativeElement.querySelector('.app-shell__account');
    if (accountEl && target && !accountEl.contains(target)) {
      this.accountOpen.set(false);
    }
  }

  toggleNavigation(): void {
    this.navigationOpen.update((open) => !open);
  }

  openCommandCenter(): void {
    this.commandCenterOpen.set(true);
  }

  toggleAccount(): void {
    this.accountOpen.update((open) => !open);
  }

  closeAccountMenu(): void {
    this.accountOpen.set(false);
  }

  selectClinic(event: Event): void {
    this.logoFailed.set(false);
    this.auth.selectClinic((event.target as HTMLSelectElement).value);
    void this.settingsStore.load(true);
  }

  onLogoError(): void {
    this.logoFailed.set(true);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}

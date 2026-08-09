import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
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

interface AppNavigationItem {
  label: string;
  icon: string;
  route?: string;
  location?: string;
  visible: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionService);
  private readonly settingsStore = inject(ClinicSettingsStore);
  readonly auth = inject(AuthStore);

  readonly compact = signal(false);
  readonly navigationOpen = signal(false);
  readonly accountOpen = signal(false);
  readonly logoFailed = signal(false);

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

  readonly navigation = computed<AppNavigationItem[]>(() => [
    { label: 'Dashboard', icon: 'space_dashboard', route: '/app/dashboard', visible: true },
    {
      label: 'Patients',
      icon: 'group',
      route: '/app/patients',
      visible: this.permissions.can(PERMISSIONS.PATIENTS_VIEW),
    },
    {
      label: 'Schedule',
      icon: 'calendar_month',
      route: '/app/schedule',
      visible: this.permissions.can(PERMISSIONS.APPOINTMENTS_VIEW),
    },
    {
      label: 'Treatments',
      icon: 'dentistry',
      route: '/app/patients',
      location: 'Patient profiles',
      visible: this.permissions.can(PERMISSIONS.TREATMENTS_VIEW),
    },
    {
      label: 'Cash records',
      icon: 'receipt_long',
      // Clinic-wide financial operations. Recording money stays on the
      // patient's Payments tab; this is the review surface.
      route: '/app/cash-records',
      visible: this.permissions.can(PERMISSIONS.CASH_RECORDS_VIEW),
    },
    {
      label: 'Settings',
      icon: 'tune',
      route: '/app/settings',
      visible: this.permissions.can(PERMISSIONS.CLINIC_SETTINGS_MANAGE),
    },
  ]);

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
      .subscribe(() => this.closeTransientMenus());
  }

  @HostListener('document:keydown.escape')
  closeTransientMenus(): void {
    this.navigationOpen.set(false);
    this.accountOpen.set(false);
  }

  toggleNavigation(): void {
    this.navigationOpen.update((open) => !open);
  }

  toggleAccount(): void {
    this.accountOpen.update((open) => !open);
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

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

interface AppNavigationItem {
  label: string;
  icon: string;
  route?: string;
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
  readonly auth = inject(AuthStore);

  readonly compact = signal(false);
  readonly navigationOpen = signal(false);
  readonly accountOpen = signal(false);
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
      visible: this.permissions.can(PERMISSIONS.PATIENTS_VIEW),
    },
    {
      label: 'Schedule',
      icon: 'calendar_month',
      visible: this.permissions.can(PERMISSIONS.APPOINTMENTS_VIEW),
    },
    {
      label: 'Treatments',
      icon: 'dentistry',
      visible: this.permissions.can(PERMISSIONS.TREATMENTS_VIEW),
    },
    {
      label: 'Cash records',
      icon: 'receipt_long',
      visible: this.permissions.can(PERMISSIONS.CASH_RECORDS_VIEW),
    },
  ]);

  constructor() {
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
    this.auth.selectClinic((event.target as HTMLSelectElement).value);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { SettingsGeneral } from '../../components/settings-general/settings-general';
import { SettingsScheduling } from '../../components/settings-scheduling/settings-scheduling';
import { SettingsWorkingHours } from '../../components/settings-working-hours/settings-working-hours';
import { ClinicSettingsStore } from '../../data-access/clinic-settings.store';
import type { SettingsSection } from '../../models/clinic-settings.models';

interface SectionTab {
  id: SettingsSection;
  label: string;
  icon: string;
  description: string;
}

/**
 * Clinic settings workspace. Page composition only: sub-navigation plus the
 * active section. Each section owns its own form, dirty state and save.
 */
@Component({
  selector: 'app-settings-page',
  imports: [SettingsGeneral, SettingsWorkingHours, SettingsScheduling],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage implements OnInit {
  protected readonly store = inject(ClinicSettingsStore);
  private readonly permissions = inject(PermissionService);

  /** Operational policy is the owner-doctor's call; others read only. */
  protected readonly canEdit = computed(() =>
    this.permissions.can(PERMISSIONS.CLINIC_SETTINGS_MANAGE),
  );

  protected readonly activeSection = signal<SettingsSection>('general');

  protected readonly tabs: readonly SectionTab[] = [
    {
      id: 'general',
      label: 'General',
      icon: 'apartment',
      description: 'Clinic identity, contact details and timezone',
    },
    {
      id: 'working-hours',
      label: 'Working hours',
      icon: 'schedule',
      description: 'Weekly opening pattern, including split shifts',
    },
    {
      id: 'scheduling',
      label: 'Scheduling',
      icon: 'event_note',
      description: 'Grid precision, default duration and capacity',
    },
  ];

  ngOnInit(): void {
    void this.store.load();
  }

  select(section: SettingsSection): void {
    this.activeSection.set(section);
  }
}

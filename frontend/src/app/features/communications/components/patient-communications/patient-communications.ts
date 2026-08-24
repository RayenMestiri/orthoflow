import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { getApiProblem } from '../../../../core/http/api-error';
import { ClinicSettingsStore } from '../../../settings/data-access/clinic-settings.store';
import { CommunicationsApiService } from '../../data-access/communications-api.service';
import type { CommunicationJob } from '../../models/communication.models';

@Component({
  selector: 'app-patient-communications',
  templateUrl: './patient-communications.html',
  styleUrl: './patient-communications.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientCommunications implements OnInit {
  readonly patientId = input.required<string>();
  private readonly api = inject(CommunicationsApiService);
  private readonly permissions = inject(PermissionService);
  private readonly clinicSettings = inject(ClinicSettingsStore);
  protected readonly items = signal<CommunicationJob[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly retryingId = signal<string | null>(null);
  protected readonly canRetry = this.permissions.can(PERMISSIONS.COMMUNICATIONS_MANAGE);
  protected readonly failedCount = computed(
    () => this.items().filter((item) => item.status === 'FAILED').length,
  );

  ngOnInit(): void {
    void this.load();
    void this.clinicSettings.load();
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await firstValueFrom(this.api.listForPatient(this.patientId())));
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loading.set(false);
    }
  }
  async retry(item: CommunicationJob): Promise<void> {
    this.retryingId.set(item.id);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.retry(item.id));
      await this.load();
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.retryingId.set(null);
    }
  }
  protected label(value: string): string {
    return value
      .toLowerCase()
      .split('_')
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ');
  }
  protected time(value: string): string {
    const timezone = this.clinicSettings.settings()?.general.timezone;
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(value));
  }
}

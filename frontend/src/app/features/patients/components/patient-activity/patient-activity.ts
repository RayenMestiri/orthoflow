import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../../core/http/api-error';
import { formatMoney } from '../../../cash-records/utils/money-format.util';
import { ClinicSettingsStore } from '../../../settings/data-access/clinic-settings.store';
import { PatientsApiService } from '../../data-access/patients-api.service';
import type {
  PatientActivity,
  PatientActivityFilter,
  PatientActivityTargetType,
} from '../../models/patient.models';

interface ActivityGroup {
  key: string;
  label: string;
  items: PatientActivity[];
}

@Component({
  selector: 'app-patient-activity',
  imports: [RouterLink],
  templateUrl: './patient-activity.html',
  styleUrl: './patient-activity.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientActivityTimeline {
  private readonly api = inject(PatientsApiService);
  private readonly clinicSettings = inject(ClinicSettingsStore);

  readonly patientId = input.required<string>();
  readonly sectionRequested = output<PatientActivityTargetType>();

  protected readonly items = signal<PatientActivity[]>([]);
  protected readonly filter = signal<PatientActivityFilter>('ALL');
  protected readonly page = signal(1);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hasMore = computed(() => this.items().length < this.total());
  protected readonly timezone = computed(
    () => this.clinicSettings.settings()?.general.timezone ?? 'UTC',
  );
  protected readonly groups = computed(() => this.groupItems(this.items()));

  protected readonly filters: readonly { value: PatientActivityFilter; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'CLINICAL', label: 'Clinical' },
    { value: 'APPOINTMENTS', label: 'Appointments' },
    { value: 'PAYMENTS', label: 'Payments' },
    { value: 'DOCUMENTS', label: 'Documents' },
  ];

  constructor() {
    void this.clinicSettings.load();
    effect(() => {
      this.patientId();
      untracked(() => void this.reload());
    });
  }

  protected async chooseFilter(filter: PatientActivityFilter): Promise<void> {
    if (filter === this.filter()) return;
    this.filter.set(filter);
    await this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(
        this.api.activity(this.patientId(), 1, 20, this.filter()),
      );
      this.items.set(result.items);
      this.total.set(result.total);
      this.page.set(1);
    } catch (error) {
      this.items.set([]);
      this.total.set(0);
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.error.set(null);
    const nextPage = this.page() + 1;
    try {
      const result = await firstValueFrom(
        this.api.activity(this.patientId(), nextPage, 20, this.filter()),
      );
      this.items.update((items) => [...items, ...result.items]);
      this.total.set(result.total);
      this.page.set(nextPage);
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected iconFor(item: PatientActivity): string {
    if (item.type.startsWith('PAYMENT')) return 'receipt_long';
    if (item.type.startsWith('DOCUMENT')) return 'description';
    if (item.type.startsWith('APPOINTMENT') || item.type.startsWith('PATIENT_')) return 'event';
    if (item.type === 'VISIT_STARTED' || item.type.startsWith('CLINICAL')) return 'clinical_notes';
    if (item.type.startsWith('FOLLOW_UP')) return 'event_repeat';
    return 'medical_services';
  }

  protected time(iso: string): string {
    return new Intl.DateTimeFormat('en', {
      timeZone: this.timezone(),
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  }

  protected dateTime(iso: string): string {
    return new Intl.DateTimeFormat('en', {
      timeZone: this.timezone(),
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat('en', {
      timeZone: this.timezone(),
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  }

  protected amount(item: PatientActivity): string | null {
    return item.amountMinor === null || !item.currency
      ? null
      : `${item.type === 'PAYMENT_CANCELLED' ? '' : '+'}${formatMoney(item.amountMinor, item.currency)}`;
  }

  protected actorRole(role: string | null): string | null {
    if (!role) return null;
    const label = role.toLowerCase().replaceAll('_', ' ');
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  protected requestSection(item: PatientActivity): void {
    if (item.targetType) this.sectionRequested.emit(item.targetType);
  }

  protected isSectionTarget(item: PatientActivity): boolean {
    return ['TREATMENT', 'CASH_RECORD', 'MEDIA'].includes(item.targetType ?? '');
  }

  private groupItems(items: PatientActivity[]): ActivityGroup[] {
    const groups = new Map<string, PatientActivity[]>();
    for (const item of items) {
      const key = this.dayKey(item.occurredAt);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups].map(([key, groupedItems]) => ({
      key,
      label: this.dayLabel(key, groupedItems[0]?.occurredAt ?? ''),
      items: groupedItems,
    }));
  }

  private dayKey(iso: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timezone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(iso));
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((candidate) => candidate.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private dayLabel(key: string, iso: string): string {
    const now = new Date();
    if (key === this.dayKey(now.toISOString())) return 'Today';
    if (key === this.dayKey(new Date(now.getTime() - 86_400_000).toISOString())) return 'Yesterday';
    return new Intl.DateTimeFormat('en', {
      timeZone: this.timezone(),
      day: 'numeric',
      month: 'short',
      year: new Date(iso).getUTCFullYear() === now.getUTCFullYear() ? undefined : 'numeric',
    }).format(new Date(iso));
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject, switchMap, tap, catchError, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { getApiProblem } from '../../../../core/http/api-error';
import { formatMoney } from '../../../cash-records/utils/money-format.util';
import { ClinicSettingsStore } from '../../../settings/data-access/clinic-settings.store';
import { PatientsApiService } from '../../data-access/patients-api.service';
import type {
  PatientActivity,
  PatientActivityFilter,
  PatientActivityTargetType,
} from '../../models/patient.models';

export interface ActivityGroup {
  key: string;
  label: string;
  items: PatientActivity[];
}

export interface ActivityNavigationEvent {
  targetType: PatientActivityTargetType;
  targetId: string | null;
  activity: PatientActivity;
}

@Component({
  selector: 'app-patient-activity',
  templateUrl: './patient-activity.html',
  styleUrl: './patient-activity.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientActivityTimeline implements OnInit {
  private readonly api = inject(PatientsApiService);
  private readonly router = inject(Router);
  private readonly clinicSettings = inject(ClinicSettingsStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly patientId = input.required<string>();
  readonly itemSelected = output<ActivityNavigationEvent>();
  readonly sectionRequested = output<PatientActivityTargetType>();

  protected readonly items = signal<PatientActivity[]>([]);
  protected readonly filter = signal<PatientActivityFilter>('ALL');
  protected readonly page = signal(1);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly loadMoreError = signal<string | null>(null);

  protected readonly hasMore = computed(() => this.items().length < this.total());
  protected readonly timezone = computed(
    () => this.clinicSettings.settings()?.general.timezone ?? 'Africa/Tunis',
  );
  protected readonly groups = computed(() => this.groupItems(this.items()));

  protected readonly filters: readonly { value: PatientActivityFilter; label: string }[] = [
    { value: 'ALL', label: 'Tous' },
    { value: 'CLINICAL', label: 'Clinique' },
    { value: 'APPOINTMENTS', label: 'Rendez-vous' },
    { value: 'PAYMENTS', label: 'Paiements' },
    { value: 'DOCUMENTS', label: 'Documents' },
  ];

  private readonly filterChange$ = new Subject<{
    patientId: string;
    filter: PatientActivityFilter;
  }>();

  ngOnInit(): void {
    void this.clinicSettings.load();

    // Stream-based filter switching with switchMap to prevent stale race conditions
    this.filterChange$
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
          this.loadMoreError.set(null);
        }),
        switchMap(({ patientId, filter }) =>
          this.api.activity(patientId, 1, 20, filter).pipe(
            catchError((err) => {
              this.error.set(getApiProblem(err).message);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (result) {
          this.items.set(result.items);
          this.total.set(result.total);
          this.page.set(1);
        } else {
          this.items.set([]);
          this.total.set(0);
        }
      });

    // Trigger initial load
    this.triggerLoad();
  }

  protected chooseFilter(filter: PatientActivityFilter): void {
    if (filter === this.filter()) return;
    this.filter.set(filter);
    this.triggerLoad();
  }

  protected retry(): void {
    this.triggerLoad();
  }

  private triggerLoad(): void {
    const pId = this.patientId();
    if (pId) {
      this.filterChange$.next({ patientId: pId, filter: this.filter() });
    }
  }

  protected loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.loadMoreError.set(null);
    const nextPage = this.page() + 1;

    this.api
      .activity(this.patientId(), nextPage, 20, this.filter())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.items.update((current) => [...current, ...result.items]);
          this.total.set(result.total);
          this.page.set(nextPage);
          this.loadingMore.set(false);
        },
        error: (err) => {
          this.loadMoreError.set(getApiProblem(err).message);
          this.loadingMore.set(false);
        },
      });
  }

  protected onEventClick(item: PatientActivity): void {
    if (item.targetType) {
      this.itemSelected.emit({
        targetType: item.targetType,
        targetId: item.targetId,
        activity: item,
      });
      this.sectionRequested.emit(item.targetType);
    }

    if (item.targetType === 'APPOINTMENT' && item.targetId) {
      void this.router.navigate(['/app/schedule'], {
        queryParams: { appointmentId: item.targetId },
      });
    }
  }

  protected iconFor(item: PatientActivity): string {
    switch (item.category) {
      case 'PAYMENT':
        return 'receipt_long';
      case 'DOCUMENT':
        return item.type === 'DOCUMENT_ARCHIVED' ? 'archive' : 'description';
      case 'APPOINTMENT':
        if (item.type === 'APPOINTMENT_CANCELLED') return 'event_busy';
        if (item.type === 'APPOINTMENT_NO_SHOW') return 'person_off';
        if (item.type === 'APPOINTMENT_COMPLETED') return 'event_available';
        return 'event';
      case 'CLINICAL':
        if (item.type === 'FOLLOW_UP_RECOMMENDED') return 'event_repeat';
        return 'edit_note';
      case 'TREATMENT':
        if (item.type === 'TREATMENT_CANCELLED') return 'cancel';
        if (item.type === 'TREATMENT_COMPLETED') return 'check_circle';
        return 'healing';
      default:
        return 'fiber_manual_record';
    }
  }

  protected time(iso: string): string {
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        timeZone: this.timezone(),
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(iso));
    } catch {
      return '';
    }
  }

  protected amount(item: PatientActivity): string | null {
    if (item.amountMinor === null || !item.currency) return null;
    const formatted = formatMoney(item.amountMinor, item.currency);
    return item.type === 'PAYMENT_CANCELLED' ? formatted : `+${formatted}`;
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
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: this.timezone(),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(iso));
      const part = (type: Intl.DateTimeFormatPartTypes): string =>
        parts.find((candidate) => candidate.type === type)?.value ?? '';
      return `${part('year')}-${part('month')}-${part('day')}`;
    } catch {
      return 'unknown';
    }
  }

  private dayLabel(key: string, iso: string): string {
    try {
      const now = new Date();
      const todayKey = this.dayKey(now.toISOString());
      const yesterdayKey = this.dayKey(new Date(now.getTime() - 86_400_000).toISOString());

      if (key === todayKey) return 'AUJOURD’HUI';
      if (key === yesterdayKey) return 'HIER';

      const itemDate = new Date(iso);
      const isCurrentYear = itemDate.getFullYear() === now.getFullYear();

      const formatted = new Intl.DateTimeFormat('fr-FR', {
        timeZone: this.timezone(),
        day: 'numeric',
        month: 'long',
        year: isCurrentYear ? undefined : 'numeric',
      }).format(itemDate);

      return formatted.toUpperCase();
    } catch {
      return key;
    }
  }
}

import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { formatMoney } from '../../../cash-records/utils/money-format.util';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { FinanceStore } from '../../data-access/finance.store';
import {
  BALANCE_FILTERS,
  BALANCE_SORTS,
  PAYMENT_STATUS_LABELS,
  type BalanceFilter,
  type BalanceSort,
  type FinanceActivityEntry,
  type PatientBalance,
} from '../../models/finance.models';

/**
 * The clinic financial operations workspace.
 *
 * Answers, in the order an owner asks them: what came in today and this month,
 * what is still owed, who owes it, and what just happened. The balances table
 * is the centre of gravity — the summary cards exist to frame it, not to be
 * admired on their own.
 *
 * This is NOT the patient Payments tab. That one is one patient's history and
 * is where money is recorded and cancelled. This one is the clinic-wide review
 * surface and is read-only.
 */
@Component({
  selector: 'app-finance-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  providers: [FinanceStore],
  templateUrl: './finance-page.html',
  styleUrl: './finance-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinancePage {
  protected readonly store = inject(FinanceStore);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionService);

  /**
   * Strategic financial overview (revenue pulse, collection rate, patient health
   * distribution) is owner / practitioner intelligence.
   *
   * Secretaries access this page to read patient balances and navigate to
   * per-patient payment history — they do not need the clinic-wide revenue picture.
   * Hiding these sections reduces unnecessary exposure of business-sensitive data.
   */
  protected readonly canViewFinancialOverview = computed(() =>
    this.permissions.can(PERMISSIONS.CLINIC_SETTINGS_MANAGE) ||
    this.permissions.can(PERMISSIONS.CASH_RECORDS_CANCEL),
  );

  protected readonly filters = BALANCE_FILTERS;
  protected readonly sorts = BALANCE_SORTS;
  protected readonly statusLabels = PAYMENT_STATUS_LABELS;

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  /** Which attention item is currently driving the table, for the active state. */
  protected readonly activeAttention = signal<BalanceFilter | null>(null);

  /**
   * Debounced search.
   *
   * A signal rather than a subscription so the component stays declarative and
   * the request only fires once the clinician stops typing.
   */
  private readonly debouncedSearch = toSignal(
    this.searchControl.valueChanges.pipe(debounceTime(300), distinctUntilChanged()),
    { initialValue: '' },
  );

  protected readonly summary = computed(() => this.store.overview()?.summary ?? null);
  protected readonly attention = computed(() => this.store.overview()?.attention ?? null);
  protected readonly distribution = computed(() => this.store.overview()?.distribution ?? null);

  /**
   * The segmented financial-health bar.
   *
   * Widths are percentages of the priced-treatment population, so the segments
   * always sum to 100 and the bar reads as a distribution rather than as four
   * unrelated bars. Empty statuses are dropped so the bar has no hairline slivers.
   */
  protected readonly healthSegments = computed(() => {
    const distribution = this.distribution();
    if (!distribution) return [];

    const segments = [
      { key: 'PAID', label: 'Paid', count: distribution.paid },
      { key: 'PARTIALLY_PAID', label: 'Partially paid', count: distribution.partiallyPaid },
      { key: 'NO_PAYMENT', label: 'No payment', count: distribution.noPayment },
      { key: 'OVERPAID', label: 'Overpaid', count: distribution.overpaid },
      { key: 'NO_AGREED_PRICE', label: 'No agreed price', count: distribution.noAgreedPrice },
    ];
    const total = segments.reduce((sum, segment) => sum + segment.count, 0);
    if (total === 0) return [];

    return segments
      .filter((segment) => segment.count > 0)
      .map((segment) => ({ ...segment, percent: (segment.count / total) * 100 }));
  });

  protected readonly healthTotal = computed(() =>
    this.healthSegments().reduce((sum, segment) => sum + segment.count, 0),
  );

  /** Counts shown on the filter pills, so the user sees the cost of a click. */
  protected readonly filterCounts = computed<Partial<Record<BalanceFilter, number>>>(() => {
    const distribution = this.distribution();
    if (!distribution) return {};
    return {
      OUTSTANDING: distribution.partiallyPaid + distribution.noPayment,
      PAID: distribution.paid,
      NO_PAYMENT: distribution.noPayment,
      OVERPAID: distribution.overpaid,
    };
  });

  /** The worklist, with empty categories dropped so it never shows four zeros. */
  protected readonly attentionItems = computed(() => {
    const attention = this.attention();
    if (!attention) return [];
    return [
      {
        key: 'OUTSTANDING' as BalanceFilter,
        label: 'Outstanding balances',
        count: attention.outstandingCount,
        unit: attention.outstandingCount === 1 ? 'patient' : 'patients',
        detail: this.money(attention.outstandingMinor),
        reviewable: true,
      },
      {
        key: 'NO_PAYMENT' as BalanceFilter,
        label: 'No payment recorded',
        count: attention.noPaymentCount,
        unit: attention.noPaymentCount === 1 ? 'treatment' : 'treatments',
        detail: 'Active care',
        reviewable: true,
      },
      {
        key: 'OVERPAID' as BalanceFilter,
        label: 'Overpaid',
        count: attention.overpaidCount,
        unit: attention.overpaidCount === 1 ? 'treatment' : 'treatments',
        detail: `+${this.money(attention.overpaidExcessMinor)}`,
        reviewable: true,
      },
      {
        // Not filterable in the balances table: this counts cash records, not
        // treatments, so "Review" would have nowhere honest to send the user.
        key: null,
        label: 'Cancelled without a linked correction',
        count: attention.cancelledUncorrectedCount,
        unit: attention.cancelledUncorrectedCount === 1 ? 'payment' : 'payments',
        detail: null,
        reviewable: false,
      },
    ].filter((item) => item.count > 0);
  });

  protected readonly totalAttentionCount = computed(() =>
    this.attentionItems().reduce((sum, item) => sum + item.count, 0),
  );

  constructor() {
    void this.store.load();

    // Re-query when the debounced term settles. The first emission is the
    // control's initial value, which the initial load already covered.
    let previous: string | null = null;
    effect(() => {
      const term = this.debouncedSearch() ?? '';
      if (previous === null) {
        previous = term;
        return;
      }
      if (term !== previous) {
        previous = term;
        void this.store.setSearch(term);
      }
    });
  }

  protected money(amountMinor: number | null | undefined): string {
    if (amountMinor === null || amountMinor === undefined) {
      return '—';
    }
    return formatMoney(amountMinor, this.store.currency());
  }

  protected async applyFilter(filter: BalanceFilter): Promise<void> {
    this.activeAttention.set(null);
    await this.store.setFilter(filter);
  }

  protected async reviewAttention(filter: BalanceFilter | null): Promise<void> {
    this.activeAttention.set(filter);
    if (filter) {
      await this.store.setFilter(filter);
      const element = document.getElementById('fin-balances-title');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      const element = document.getElementById('fin-activity-title');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  protected async changeSort(value: string): Promise<void> {
    await this.store.setSort(value as BalanceSort);
  }

  /** A row is a patient's money: send the user to that patient's Payments tab with treatment scope. */
  protected openPatient(row: PatientBalance): void {
    void this.router.navigate(['/app/patients', row.patientId], {
      queryParams: {
        tab: 'payments',
        treatmentId: row.treatmentId,
        treatmentLabel: row.treatmentLabel,
      },
    });
  }

  protected trackBalance(_index: number, row: PatientBalance): string {
    return row.treatmentId;
  }

  /** Two letters for the row avatar. Presentation only — never a medical claim. */
  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return `${first}${last}`.toUpperCase() || '—';
  }

  /**
   * How far a treatment is toward being settled, 0–100.
   *
   * Clamped for the same reason as the clinic rail: an overpaid row shows a
   * full track plus a separate excess marker, not a bar spilling past its end.
   */
  protected progressPercent(row: PatientBalance): number {
    if (row.agreedMinor === null || row.agreedMinor <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((row.recordedMinor / row.agreedMinor) * 100)));
  }

  // --- Recent Money Movement Journal Logic ---------------------------

  protected readonly activityFilter = signal<'ALL' | 'CASH' | 'CARD' | 'TRANSFER' | 'CANCELLED'>(
    'ALL',
  );

  protected readonly selectedActivityDetail = signal<FinanceActivityEntry | null>(null);

  protected readonly showAllActivity = signal(false);

  protected readonly filteredActivity = computed<FinanceActivityEntry[]>(() => {
    const filter = this.activityFilter();
    const list = this.store.activity();
    if (filter === 'ALL') return list;
    if (filter === 'CANCELLED') {
      return list.filter((item) => item.status === 'CANCELLED');
    }
    if (filter === 'CASH') {
      return list.filter(
        (item) => item.status !== 'CANCELLED' && item.paymentMethod.toUpperCase() === 'CASH',
      );
    }
    if (filter === 'CARD') {
      return list.filter(
        (item) =>
          item.status !== 'CANCELLED' &&
          (item.paymentMethod.toUpperCase() === 'CARD' ||
            item.paymentMethod.toUpperCase() === 'CARD_AT_CLINIC'),
      );
    }
    if (filter === 'TRANSFER') {
      return list.filter(
        (item) =>
          item.status !== 'CANCELLED' &&
          (item.paymentMethod.toUpperCase() === 'TRANSFER' ||
            item.paymentMethod.toUpperCase() === 'BANK_TRANSFER'),
      );
    }
    return list;
  });

  protected readonly hasMoreActivity = computed(() => this.filteredActivity().length > 15);

  protected readonly displayedActivity = computed(() => {
    const list = this.filteredActivity();
    return this.showAllActivity() ? list : list.slice(0, 15);
  });

  /**
   * Total recorded amount of the loaded activity movements.
   */
  protected readonly activityRecordedTotalMinor = computed(() => {
    return this.store
      .activity()
      .filter((item) => item.status !== 'CANCELLED')
      .reduce((sum, item) => sum + item.amountMinor, 0);
  });

  /**
   * Groups transactions by day for rapid visual scanning.
   */
  protected readonly groupedActivity = computed<
    Array<{
      dateKey: string;
      dateLabel: string;
      isToday: boolean;
      isYesterday: boolean;
      entries: FinanceActivityEntry[];
    }>
  >(() => {
    const items = this.displayedActivity();
    if (!items.length) return [];

    const now = new Date();
    const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate(),
    ).toISOString();

    const groupsMap = new Map<
      string,
      {
        dateKey: string;
        dateLabel: string;
        isToday: boolean;
        isYesterday: boolean;
        entries: FinanceActivityEntry[];
      }
    >();

    for (const entry of items) {
      const d = new Date(entry.receivedAt);
      const dayKey = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      const isToday = dayKey === todayStr;
      const isYesterday = dayKey === yesterdayStr;

      let dateLabel = '';
      if (isToday) {
        dateLabel = "Aujourd'hui";
      } else if (isYesterday) {
        dateLabel = 'Hier';
      } else {
        dateLabel = new Intl.DateTimeFormat('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        }).format(d);
      }

      if (!groupsMap.has(dayKey)) {
        groupsMap.set(dayKey, {
          dateKey: dayKey,
          dateLabel,
          isToday,
          isYesterday,
          entries: [],
        });
      }
      groupsMap.get(dayKey)!.entries.push(entry);
    }

    return Array.from(groupsMap.values());
  });

  protected setActivityFilter(filter: 'ALL' | 'CASH' | 'CARD' | 'TRANSFER' | 'CANCELLED'): void {
    this.activityFilter.set(filter);
  }

  protected toggleShowAllActivity(): void {
    this.showAllActivity.update((prev) => !prev);
  }

  protected openActivityDetail(entry: FinanceActivityEntry): void {
    this.selectedActivityDetail.set(entry);
  }

  protected closeActivityDetail(): void {
    this.selectedActivityDetail.set(null);
  }

  protected openPatientPayment(entry: FinanceActivityEntry, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    void this.router.navigate(['/app/patients', entry.patientId], {
      queryParams: {
        tab: 'payments',
        recordId: entry.cashRecordId,
        receiptNumber: entry.receiptNumber ?? undefined,
      },
    });
  }

  protected friendlyMethod(method: string): string {
    switch (method.toUpperCase()) {
      case 'CASH':
        return 'Espèces';
      case 'CARD':
      case 'CARD_AT_CLINIC':
        return 'Carte bancaire';
      case 'TRANSFER':
      case 'BANK_TRANSFER':
        return 'Virement';
      case 'CHECK':
        return 'Chèque';
      default:
        return method;
    }
  }

  protected methodIcon(method: string): string {
    switch (method.toUpperCase()) {
      case 'CASH':
        return 'payments';
      case 'CARD':
      case 'CARD_AT_CLINIC':
        return 'credit_card';
      case 'TRANSFER':
      case 'BANK_TRANSFER':
        return 'account_balance';
      case 'CHECK':
        return 'edit_note';
      default:
        return 'receipt';
    }
  }

  protected friendlyPayer(entry: FinanceActivityEntry): string {
    if (entry.status === 'CANCELLED') {
      return entry.cancelledByName ? `Annulé par ${entry.cancelledByName}` : 'Paiement annulé';
    }
    const type = entry.payerType ?? 'SELF';
    switch (type) {
      case 'SELF':
        return 'Patient';
      case 'GUARDIAN':
        return 'Tuteur / Parent';
      case 'OTHER':
        return entry.payerLabel ? entry.payerLabel : 'Tiers payeur';
      default:
        return 'Patient';
    }
  }

  protected trackActivity(_index: number, entry: FinanceActivityEntry): string {
    return entry.cashRecordId;
  }
}

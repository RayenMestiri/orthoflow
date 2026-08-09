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
import { FinanceStore } from '../../data-access/finance.store';
import {
  BALANCE_FILTERS,
  BALANCE_SORTS,
  PAYMENT_STATUS_LABELS,
  type BalanceFilter,
  type BalanceSort,
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
    if (!filter) return;
    this.activeAttention.set(filter);
    await this.store.setFilter(filter);
  }

  protected async changeSort(value: string): Promise<void> {
    await this.store.setSort(value as BalanceSort);
  }

  /** A row is a patient's money: send the user to that patient's Payments tab. */
  protected openPatient(row: PatientBalance): void {
    void this.router.navigate(['/app/patients', row.patientId]);
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
}

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
import { Router } from '@angular/router';
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
  imports: [DatePipe, ReactiveFormsModule],
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
        reviewable: true,
      },
      {
        key: 'NO_PAYMENT' as BalanceFilter,
        label: 'No payment recorded',
        count: attention.noPaymentCount,
        unit: attention.noPaymentCount === 1 ? 'treatment' : 'treatments',
        reviewable: true,
      },
      {
        key: 'OVERPAID' as BalanceFilter,
        label: 'Overpaid',
        count: attention.overpaidCount,
        unit: attention.overpaidCount === 1 ? 'treatment' : 'treatments',
        reviewable: true,
      },
      {
        // Not filterable in the balances table: this counts cash records, not
        // treatments, so "Review" would have nowhere honest to send the user.
        key: null,
        label: 'Cancelled without a linked correction',
        count: attention.cancelledUncorrectedCount,
        unit: attention.cancelledUncorrectedCount === 1 ? 'payment' : 'payments',
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
}

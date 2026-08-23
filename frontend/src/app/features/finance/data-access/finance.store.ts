import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../core/http/api-error';
import type {
  BalanceFilter,
  BalanceSort,
  FinanceActivityEntry,
  FinanceOverview,
  PatientBalance,
} from '../models/finance.models';
import { FinanceApiService } from './finance.api';

/**
 * Owns the clinic financial workspace.
 *
 * THREE INDEPENDENT REGIONS. The summary, the balances table and the activity
 * feed each load and fail on their own, so a slow aggregation or one broken
 * endpoint degrades a single panel instead of blanking the page. That is the
 * difference between "the activity feed is unavailable" and "Finance is down".
 */
@Injectable()
export class FinanceStore {
  private readonly api = inject(FinanceApiService);

  private readonly overviewState = signal<FinanceOverview | null>(null);
  private readonly balancesState = signal<PatientBalance[]>([]);
  private readonly activityState = signal<FinanceActivityEntry[]>([]);

  private readonly filterState = signal<BalanceFilter>('ALL');
  private readonly sortState = signal<BalanceSort>('REMAINING_DESC');
  private readonly searchState = signal('');
  private readonly pageState = signal(1);
  private readonly totalState = signal(0);
  private readonly pagesState = signal(0);

  private readonly overviewLoadingState = signal(false);
  private readonly balancesLoadingState = signal(false);
  private readonly activityLoadingState = signal(false);

  private readonly overviewErrorState = signal<string | null>(null);
  private readonly balancesErrorState = signal<string | null>(null);
  private readonly activityErrorState = signal<string | null>(null);

  /**
   * Guards against out-of-order balance responses.
   *
   * Typing in the search box or clicking through filters fires overlapping
   * requests; without this the slowest reply wins and the table contradicts the
   * selected filter.
   */
  private balancesRequestId = 0;

  readonly overview = this.overviewState.asReadonly();
  readonly balances = this.balancesState.asReadonly();
  readonly activity = this.activityState.asReadonly();
  readonly filter = this.filterState.asReadonly();
  readonly sort = this.sortState.asReadonly();
  readonly search = this.searchState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly pages = this.pagesState.asReadonly();

  readonly isOverviewLoading = this.overviewLoadingState.asReadonly();
  readonly isBalancesLoading = this.balancesLoadingState.asReadonly();
  readonly isActivityLoading = this.activityLoadingState.asReadonly();

  readonly overviewError = this.overviewErrorState.asReadonly();
  readonly balancesError = this.balancesErrorState.asReadonly();
  readonly activityError = this.activityErrorState.asReadonly();

  readonly currency = computed(() => this.overviewState()?.summary.currency ?? 'TND');
  readonly hasBalances = computed(() => this.balancesState().length > 0);

  /** True only when the clinic has recorded nothing at all, ever. */
  readonly isEmptyWorkspace = computed(() => {
    const overview = this.overviewState();
    return (
      overview !== null &&
      overview.summary.receivedMonthCount === 0 &&
      this.totalState() === 0 &&
      this.searchState().length === 0 &&
      this.filterState() === 'ALL'
    );
  });

  /** Loads all three regions concurrently; one failure does not block the rest. */
  async load(): Promise<void> {
    await Promise.all([this.loadOverview(), this.loadBalances(), this.loadActivity()]);
  }

  async loadOverview(): Promise<void> {
    this.overviewLoadingState.set(true);
    this.overviewErrorState.set(null);
    try {
      this.overviewState.set(await firstValueFrom(this.api.overview()));
    } catch (error) {
      this.overviewErrorState.set(getApiProblem(error).message);
    } finally {
      this.overviewLoadingState.set(false);
    }
  }

  async loadBalances(): Promise<void> {
    const requestId = ++this.balancesRequestId;
    this.balancesLoadingState.set(true);
    this.balancesErrorState.set(null);
    try {
      const page = await firstValueFrom(
        this.api.patientBalances({
          filter: this.filterState(),
          sort: this.sortState(),
          search: this.searchState(),
          page: this.pageState(),
          limit: 20,
        }),
      );
      if (requestId !== this.balancesRequestId) return;
      this.balancesState.set(page.items);
      this.totalState.set(page.total);
      this.pagesState.set(page.pages);
    } catch (error) {
      if (requestId !== this.balancesRequestId) return;
      this.balancesErrorState.set(getApiProblem(error).message);
    } finally {
      if (requestId === this.balancesRequestId) this.balancesLoadingState.set(false);
    }
  }

  async loadActivity(): Promise<void> {
    this.activityLoadingState.set(true);
    this.activityErrorState.set(null);
    try {
      this.activityState.set(await firstValueFrom(this.api.activity(50)));
    } catch (error) {
      this.activityErrorState.set(getApiProblem(error).message);
    } finally {
      this.activityLoadingState.set(false);
    }
  }

  /** Any table control resets to page 1 — page 3 of a new filter is nonsense. */
  async setFilter(filter: BalanceFilter): Promise<void> {
    this.filterState.set(filter);
    this.pageState.set(1);
    await this.loadBalances();
  }

  async setSort(sort: BalanceSort): Promise<void> {
    this.sortState.set(sort);
    this.pageState.set(1);
    await this.loadBalances();
  }

  async setSearch(search: string): Promise<void> {
    this.searchState.set(search);
    this.pageState.set(1);
    await this.loadBalances();
  }

  async setPage(page: number): Promise<void> {
    this.pageState.set(Math.max(1, page));
    await this.loadBalances();
  }

  /** Called after a payment is recorded elsewhere on the page. */
  async refreshAfterMutation(): Promise<void> {
    await Promise.all([this.loadOverview(), this.loadBalances(), this.loadActivity()]);
  }

  dismissErrors(): void {
    this.overviewErrorState.set(null);
    this.balancesErrorState.set(null);
    this.activityErrorState.set(null);
  }
}

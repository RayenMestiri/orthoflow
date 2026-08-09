import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../core/http/api-error';
import type {
  CashRecord,
  CashRecordFilter,
  OverpaymentWarning,
  RecordPaymentInput,
} from '../models/cash-record.model';
import type { FinancialSummary } from '../models/financial-summary.model';
import type { ReceiptDocument } from '../models/receipt.model';
import { CashRecordApiService } from './cash-record.api';

/** Which panel the drawer is showing, or `null` when it is closed. */
export type DrawerMode = 'record' | 'cancel' | 'details' | null;

/**
 * Owns one patient's financial workspace.
 *
 * Scoped to the component rather than the root injector: money belongs to a
 * patient file, and a store shared across profiles would briefly show the
 * previous patient's payments after navigation — which, in this domain, is the
 * worst possible glitch.
 *
 * FINANCIAL TRUTH LIVES ON THE SERVER. `summary` is whatever the backend last
 * said. The derived signals below are display conveniences; after every write
 * the summary is refetched rather than adjusted locally.
 */
@Injectable()
export class CashRecordStore {
  private readonly api = inject(CashRecordApiService);

  private readonly patientIdState = signal<string | null>(null);
  private readonly recordsState = signal<CashRecord[]>([]);
  private readonly summaryState = signal<FinancialSummary | null>(null);
  private readonly treatmentSummaryState = signal<FinancialSummary | null>(null);
  private readonly receiptState = signal<ReceiptDocument | null>(null);
  private readonly selectedState = signal<CashRecord | null>(null);
  private readonly filterState = signal<CashRecordFilter>('ALL');
  private readonly drawerState = signal<DrawerMode>(null);

  private readonly loadingState = signal(false);
  private readonly submittingState = signal(false);
  private readonly loadedState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly overpaymentState = signal<OverpaymentWarning | null>(null);
  private readonly lastRecordedState = signal<CashRecord | null>(null);

  readonly records = this.recordsState.asReadonly();
  readonly summary = this.summaryState.asReadonly();
  readonly treatmentSummary = this.treatmentSummaryState.asReadonly();
  readonly receipt = this.receiptState.asReadonly();
  readonly selectedRecord = this.selectedState.asReadonly();
  readonly filter = this.filterState.asReadonly();
  readonly drawerMode = this.drawerState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();
  readonly isSubmitting = this.submittingState.asReadonly();
  readonly isLoaded = this.loadedState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly overpaymentWarning = this.overpaymentState.asReadonly();
  /** Set after a successful record so the drawer can confirm it. */
  readonly lastRecorded = this.lastRecordedState.asReadonly();

  /**
   * The summary the workspace displays: the treatment's when one is in scope,
   * otherwise the patient's. The treatment view is the one that can show a
   * remaining balance, because only a treatment has an agreed price.
   */
  readonly activeSummary = computed(() => this.treatmentSummaryState() ?? this.summaryState());

  readonly currency = computed(() => this.activeSummary()?.currency ?? 'TND');

  readonly visibleRecords = computed(() => {
    const filter = this.filterState();
    const records = this.recordsState();
    return filter === 'ALL' ? records : records.filter((record) => record.status === filter);
  });

  readonly activeRecordCount = computed(
    () => this.recordsState().filter((record) => record.status === 'RECORDED').length,
  );

  readonly hasRecords = computed(() => this.recordsState().length > 0);

  /**
   * Loads a patient's workspace.
   *
   * `treatmentId` scopes the summary to one course of care so an agreed price
   * and a remaining balance can be shown. The history stays patient-wide, since
   * a deposit taken before any treatment existed still belongs in it.
   */
  async load(patientId: string, treatmentId: string | null = null, force = false): Promise<void> {
    if (this.patientIdState() !== patientId) {
      this.patientIdState.set(patientId);
      this.recordsState.set([]);
      this.summaryState.set(null);
      this.treatmentSummaryState.set(null);
      this.loadedState.set(false);
    } else if (this.loadingState() || (this.loadedState() && !force)) {
      return;
    }

    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      await this.refresh(patientId, treatmentId);
      this.loadedState.set(true);
    } catch (error) {
      this.errorState.set(getApiProblem(error).message);
    } finally {
      this.loadingState.set(false);
    }
  }

  setFilter(filter: CashRecordFilter): void {
    this.filterState.set(filter);
  }

  openRecordDrawer(): void {
    this.overpaymentState.set(null);
    this.lastRecordedState.set(null);
    this.errorState.set(null);
    this.drawerState.set('record');
  }

  openCancelDrawer(record: CashRecord): void {
    this.selectedState.set(record);
    this.errorState.set(null);
    this.drawerState.set('cancel');
  }

  openDetails(record: CashRecord): void {
    this.selectedState.set(record);
    this.drawerState.set('details');
  }

  closeDrawer(): void {
    if (this.submittingState()) {
      return;
    }
    this.drawerState.set(null);
    this.overpaymentState.set(null);
    this.lastRecordedState.set(null);
  }

  dismissError(): void {
    this.errorState.set(null);
  }

  dismissOverpaymentWarning(): void {
    this.overpaymentState.set(null);
  }

  closeReceipt(): void {
    this.receiptState.set(null);
  }

  /**
   * Records money the clinic received.
   *
   * A `PAYMENT_EXCEEDS_REMAINING_AMOUNT` reply is not an error the user has to
   * decipher: it is captured as a warning the drawer renders, with the excess
   * spelled out and a confirm action when the user is allowed to give one.
   */
  async record(
    input: RecordPaymentInput,
    treatmentId: string | null = null,
  ): Promise<CashRecord | null> {
    const patientId = this.patientIdState();
    if (!patientId) {
      return null;
    }

    this.submittingState.set(true);
    this.errorState.set(null);
    this.overpaymentState.set(null);
    try {
      const record = await firstValueFrom(this.api.record(patientId, input));
      await this.refresh(patientId, treatmentId);
      this.lastRecordedState.set(record);
      return record;
    } catch (error) {
      const problem = getApiProblem(error);
      if (problem.code === 'PAYMENT_EXCEEDS_REMAINING_AMOUNT' && problem.details) {
        this.overpaymentState.set(problem.details as OverpaymentWarning);
      } else {
        this.errorState.set(problem.message);
      }
      return null;
    } finally {
      this.submittingState.set(false);
    }
  }

  async cancel(
    cashRecordId: string,
    reason: string,
    treatmentId: string | null = null,
  ): Promise<boolean> {
    const patientId = this.patientIdState();
    if (!patientId) {
      return false;
    }

    this.submittingState.set(true);
    this.errorState.set(null);
    try {
      await firstValueFrom(this.api.cancel(cashRecordId, reason));
      await this.refresh(patientId, treatmentId);
      this.drawerState.set(null);
      return true;
    } catch (error) {
      this.errorState.set(getApiProblem(error).message);
      return false;
    } finally {
      this.submittingState.set(false);
    }
  }

  async openReceipt(cashRecordId: string): Promise<void> {
    this.errorState.set(null);
    try {
      this.receiptState.set(await firstValueFrom(this.api.receiptFor(cashRecordId)));
    } catch (error) {
      this.errorState.set(getApiProblem(error).message);
    }
  }

  /** Re-reads history and totals together, so the two can never disagree. */
  private async refresh(patientId: string, treatmentId: string | null): Promise<void> {
    const [page, summary] = await Promise.all([
      firstValueFrom(this.api.listForPatient(patientId)),
      firstValueFrom(this.api.patientSummary(patientId)),
    ]);
    this.recordsState.set(page.items);
    this.summaryState.set(summary);

    this.treatmentSummaryState.set(
      treatmentId ? await firstValueFrom(this.api.treatmentSummary(treatmentId)) : null,
    );
  }
}

import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { CashRecordStore, type CorrectionPrefill } from '../../data-access/cash-record.store';
import {
  CASH_RECORD_STATUS_LABELS,
  PAYER_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type CashRecord,
  type CashRecordFilter,
} from '../../models/cash-record.model';
import type { CashRecordActivity } from '../../models/cash-record-activity.model';
import { CashRecordApiService } from '../../data-access/cash-record.api';
import { formatMoney } from '../../utils/money-format.util';
import {
  RecordPaymentDrawer,
  type DrawerGuardian,
} from '../record-payment-drawer/record-payment-drawer';
import { ReceiptView } from '../receipt-view/receipt-view';

/**
 * A patient's financial workspace — V2.
 *
 * Changes over V1:
 *  - Payment rows open a dedicated detail drawer (no inline expand)
 *  - The detail drawer shows an activity timeline sourced from the audit log
 *  - The cancel dialog is a side-drawer, matching Record Payment's layout
 *  - After cancellation, a "Record corrected payment" CTA pre-fills the drawer
 */
@Component({
  selector: 'app-patient-cash-records',
  imports: [DatePipe, ReactiveFormsModule, RecordPaymentDrawer, ReceiptView],
  providers: [CashRecordStore],
  templateUrl: './patient-cash-records.html',
  styleUrl: './patient-cash-records.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientCashRecords {
  private readonly permissions = inject(PermissionService);
  private readonly api = inject(CashRecordApiService);
  protected readonly store = inject(CashRecordStore);

  readonly patientId = input.required<string>();
  readonly patientName = input<string>('');
  /** Scopes the summary so an agreed price and a balance can be shown. */
  readonly treatmentId = input<string | null>(null);
  readonly treatmentLabel = input<string | null>(null);
  readonly guardians = input<DrawerGuardian[]>([]);
  readonly initialRecordId = input<string | null>(null);
  readonly initialReceiptNumber = input<string | null>(null);
  readonly initialReceiptId = input<string | null>(null);
  readonly autoOpenRecordDrawer = input<boolean>(false);

  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly payerLabels = PAYER_TYPE_LABELS;
  protected readonly statusLabels = CASH_RECORD_STATUS_LABELS;
  protected readonly filters: readonly CashRecordFilter[] = ['ALL', 'RECORDED', 'CANCELLED'];
  protected readonly filterLabels: Record<CashRecordFilter, string> = {
    ALL: 'All',
    RECORDED: 'Recorded',
    CANCELLED: 'Cancelled',
  };

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly monthFilter = new FormControl('ALL', { nonNullable: true });
  protected readonly methodFilter = new FormControl('ALL', { nonNullable: true });

  protected readonly canRecord = this.permissions.can(PERMISSIONS.CASH_RECORDS_RECORD);
  protected readonly canCancel = this.permissions.can(PERMISSIONS.CASH_RECORDS_CANCEL);

  protected readonly cancelReason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3), Validators.maxLength(500)],
  });

  protected readonly summary = this.store.activeSummary;

  /** Activity timeline for the currently-open detail drawer. */
  protected readonly activityState = signal<CashRecordActivity[]>([]);
  protected readonly activityLoading = signal(false);

  /** Extract unique months from payment history for the month dropdown filter. */
  protected readonly availableMonths = computed(() => {
    const monthsSet = new Set<string>();
    for (const record of this.store.records()) {
      if (record.receivedAt) {
        const d = new Date(record.receivedAt);
        if (!isNaN(d.getTime())) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          monthsSet.add(`${yyyy}-${mm}`);
        }
      }
    }
    return Array.from(monthsSet)
      .sort()
      .reverse()
      .map((ym) => {
        const [year, month] = ym.split('-');
        const date = new Date(Number(year), Number(month) - 1, 1);
        const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return { value: ym, label };
      });
  });

  /** Multi-facet client-side filtered view over payments (status, search text, method, month/date range). */
  protected readonly filteredRecords = computed(() => {
    let records = this.store.visibleRecords();
    const query = this.search.value.trim().toLowerCase();
    const month = this.monthFilter.value;
    const method = this.methodFilter.value;

    if (query) {
      records = records.filter((r) => {
        const receipt = (r.receiptNumber ?? '').toLowerCase();
        const payer = (r.payerName ?? '').toLowerCase();
        const note = (r.note ?? '').toLowerCase();
        const purpose = (r.purpose ?? '').toLowerCase();
        const receiver = (r.receivedByName ?? '').toLowerCase();
        const methodText = (this.methodLabels[r.paymentMethod] ?? '').toLowerCase();
        const amount = r.amountFormatted.toLowerCase();
        return (
          receipt.includes(query) ||
          payer.includes(query) ||
          note.includes(query) ||
          purpose.includes(query) ||
          receiver.includes(query) ||
          methodText.includes(query) ||
          amount.includes(query)
        );
      });
    }

    if (method !== 'ALL') {
      records = records.filter((r) => r.paymentMethod === method);
    }

    if (month !== 'ALL') {
      const now = new Date();
      records = records.filter((r) => {
        const d = new Date(r.receivedAt);
        if (isNaN(d.getTime())) return false;

        if (month === 'THIS_MONTH') {
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }
        if (month === 'LAST_MONTH') {
          const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth();
        }
        if (month === 'LAST_3_MONTHS') {
          const m3 = new Date(now.getFullYear(), now.getMonth() - 3, 1);
          return d >= m3;
        }
        if (month === 'THIS_YEAR') {
          return d.getFullYear() === now.getFullYear();
        }
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${yyyy}-${mm}` === month;
      });
    }

    if (this.treatmentId() && this.onlyCurrentTreatment()) {
      const tid = this.treatmentId();
      records = records.filter((r) => r.treatmentId === tid);
    }

    return records;
  });

  readonly onlyCurrentTreatment = signal<boolean>(true);

  protected toggleTreatmentFilter(): void {
    this.onlyCurrentTreatment.update((v) => !v);
  }

  protected readonly hasActiveFilters = computed(
    () =>
      this.search.value.trim().length > 0 ||
      this.monthFilter.value !== 'ALL' ||
      this.methodFilter.value !== 'ALL' ||
      this.store.filter() !== 'ALL' ||
      (this.treatmentId() !== null && this.onlyCurrentTreatment()),
  );

  protected clearFilters(): void {
    this.search.reset('');
    this.monthFilter.reset('ALL');
    this.methodFilter.reset('ALL');
    this.store.setFilter('ALL');
  }

  /**
   * True once the agreed price is known, which is the only case where a
   * remaining balance is meaningful.
   */
  protected readonly hasAgreedPrice = computed(
    () =>
      this.summary()?.agreedAmountMinor !== null && this.summary()?.agreedAmountMinor !== undefined,
  );

  private openedInitialTarget: string | null = null;
  private hasAutoOpened = false;

  constructor() {
    effect(() => {
      const patientId = this.patientId();
      if (patientId) {
        void this.store.load(patientId, this.treatmentId());
      }
    });

    effect(() => {
      if (this.autoOpenRecordDrawer() && this.canRecord && !this.hasAutoOpened && this.store.isLoaded()) {
        this.hasAutoOpened = true;
        this.store.openRecordDrawer();
      }
    });

    effect(() => {
      const records = this.store.records();
      if (records.length === 0) return;

      const recordId = this.initialRecordId();
      const receiptNumber = this.initialReceiptNumber();
      const receiptId = this.initialReceiptId();

      if (!recordId && !receiptNumber && !receiptId) return;

      const targetKey = `${recordId ?? ''}_${receiptNumber ?? ''}_${receiptId ?? ''}`;
      if (this.openedInitialTarget === targetKey) return;

      if (receiptNumber || receiptId) {
        const found = records.find(
          (r) =>
            (receiptNumber && r.receiptNumber === receiptNumber) ||
            (receiptId && r.id === receiptId),
        );
        if (found) {
          this.openedInitialTarget = targetKey;
          void this.store.openReceipt(found.id);
          return;
        }
      }

      if (recordId) {
        const found = records.find((r) => r.id === recordId);
        if (found) {
          this.openedInitialTarget = targetKey;
          this.openDetails(found);
        }
      }
    });
  }

  openRecordDrawerDirectly(): void {
    if (this.canRecord) {
      this.store.openRecordDrawer();
    }
  }

  protected money(amountMinor: number | null | undefined): string {
    if (amountMinor === null || amountMinor === undefined) {
      return 'Not set';
    }
    return formatMoney(amountMinor, this.store.currency());
  }

  protected openDetails(record: CashRecord): void {
    this.store.openDetails(record);
    void this.loadActivity(record.id);
  }

  protected openCancel(record: CashRecord): void {
    this.cancelReason.reset('');
    this.store.openCancelDrawer(record);
  }

  protected openCorrection(record: CashRecord): void {
    const prefill: CorrectionPrefill = {
      correctionOfRecordId: record.id,
      treatmentId: record.treatmentId,
      paymentMethod: record.paymentMethod,
      payerType: record.payerType,
      guardianId: record.guardianId,
    };
    this.store.openRecordDrawer(prefill);
  }

  protected async confirmCancel(event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
    }
    const record = this.store.selectedRecord();
    if (!record || this.cancelReason.invalid) {
      this.cancelReason.markAsTouched();
      return;
    }
    await this.store.cancel(record.id, this.cancelReason.value.trim(), this.treatmentId());
  }

  protected openReceipt(record: CashRecord): void {
    void this.store.openReceipt(record.id);
  }

  protected activityLabel(action: string): string {
    const labels: Record<string, string> = {
      'cash_record.created': 'Payment recorded',
      'cash_record.cancelled': 'Payment cancelled',
      'cash_record.corrected': 'Recorded as correction',
      'cash_record.overpayment_approved': 'Overpayment approved',
    };
    return labels[action] ?? action;
  }

  /** Monotonically-incrementing counter that guards against racing activity loads. */
  private activityRequestId = 0;

  private async loadActivity(cashRecordId: string): Promise<void> {
    const requestId = ++this.activityRequestId;
    this.activityLoading.set(true);
    this.activityState.set([]);
    try {
      const items = await firstValueFrom(this.api.activityForRecord(cashRecordId));
      // Discard if a newer request has already started
      if (requestId !== this.activityRequestId) return;
      this.activityState.set(items);
    } catch {
      // Non-critical: activity is informational only
    } finally {
      if (requestId === this.activityRequestId) {
        this.activityLoading.set(false);
      }
    }
  }
}

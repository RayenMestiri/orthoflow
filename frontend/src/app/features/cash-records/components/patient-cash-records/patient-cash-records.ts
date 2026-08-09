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
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { CashRecordStore } from '../../data-access/cash-record.store';
import {
  CASH_RECORD_STATUS_LABELS,
  PAYER_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type CashRecord,
  type CashRecordFilter,
} from '../../models/cash-record.model';
import { formatMoney } from '../../utils/money-format.util';
import {
  RecordPaymentDrawer,
  type DrawerGuardian,
} from '../record-payment-drawer/record-payment-drawer';
import { ReceiptView } from '../receipt-view/receipt-view';

/**
 * A patient's financial workspace.
 *
 * Self-contained: the patient profile adds one tag and everything from loading
 * to permissions to printing lives here. It reads as a ledger — what was
 * agreed, what has been recorded, what remains, and every movement in between —
 * because that is the conversation this feature exists to settle.
 *
 * READ-ONLY ACROSS THE BOUNDARY: `treatmentId` and `treatmentLabel` are inputs
 * supplied by whatever renders this component. Nothing here imports from the
 * Treatment feature.
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
  protected readonly store = inject(CashRecordStore);

  readonly patientId = input.required<string>();
  readonly patientName = input<string>('');
  /** Scopes the summary so an agreed price and a balance can be shown. */
  readonly treatmentId = input<string | null>(null);
  readonly treatmentLabel = input<string | null>(null);
  readonly guardians = input<DrawerGuardian[]>([]);

  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly payerLabels = PAYER_TYPE_LABELS;
  protected readonly statusLabels = CASH_RECORD_STATUS_LABELS;
  protected readonly filters: readonly CashRecordFilter[] = ['ALL', 'RECORDED', 'CANCELLED'];
  protected readonly filterLabels: Record<CashRecordFilter, string> = {
    ALL: 'All',
    RECORDED: 'Recorded',
    CANCELLED: 'Cancelled',
  };

  protected readonly canRecord = this.permissions.can(PERMISSIONS.CASH_RECORDS_RECORD);
  protected readonly canCancel = this.permissions.can(PERMISSIONS.CASH_RECORDS_CANCEL);

  protected readonly cancelReason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3), Validators.maxLength(500)],
  });

  /** Which history row has its detail panel expanded. */
  protected readonly expandedId = signal<string | null>(null);

  protected readonly summary = this.store.activeSummary;

  /**
   * True once the agreed price is known, which is the only case where a
   * remaining balance is meaningful. Without it the UI shows "Not set" rather
   * than a zero that would read as "nothing left to pay".
   */
  protected readonly hasAgreedPrice = computed(
    () =>
      this.summary()?.agreedAmountMinor !== null && this.summary()?.agreedAmountMinor !== undefined,
  );

  constructor() {
    effect(() => {
      const patientId = this.patientId();
      if (patientId) {
        void this.store.load(patientId, this.treatmentId());
      }
    });
  }

  protected money(amountMinor: number | null | undefined): string {
    if (amountMinor === null || amountMinor === undefined) {
      return 'Not set';
    }
    return formatMoney(amountMinor, this.store.currency());
  }

  protected toggleDetails(record: CashRecord): void {
    this.expandedId.update((current) => (current === record.id ? null : record.id));
  }

  protected openCancel(record: CashRecord): void {
    this.cancelReason.reset('');
    this.store.openCancelDrawer(record);
  }

  protected async confirmCancel(): Promise<void> {
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
}

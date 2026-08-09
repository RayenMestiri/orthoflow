import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CashRecordStore } from '../../data-access/cash-record.store';
import {
  PAYER_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PayerType,
  type PaymentMethod,
} from '../../models/cash-record.model';
import type { FinancialSummary } from '../../models/financial-summary.model';
import { createIdempotencyKey, formatMoney, parseAmount } from '../../utils/money-format.util';

export interface DrawerGuardian {
  id: string;
  fullName: string;
}

/**
 * The record-payment drawer.
 *
 * The wording throughout is deliberate: this records money the clinic has
 * already received. Nothing here charges anyone. The submit button says
 * "Record payment", never "Pay".
 */
@Component({
  selector: 'app-record-payment-drawer',
  imports: [ReactiveFormsModule],
  templateUrl: './record-payment-drawer.html',
  styleUrl: './record-payment-drawer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordPaymentDrawer {
  protected readonly store = inject(CashRecordStore);

  readonly patientName = input<string>('');
  readonly treatmentLabel = input<string | null>(null);
  readonly treatmentId = input<string | null>(null);
  readonly guardians = input<DrawerGuardian[]>([]);
  readonly summary = input<FinancialSummary | null>(null);

  readonly closed = output<void>();

  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly payerLabels = PAYER_TYPE_LABELS;

  /**
   * One key per drawer opening.
   *
   * Regenerated only when the user starts a genuinely new payment, so every
   * retry of *this* payment — including an impatient second click — carries the
   * same key and the backend returns the first record instead of a duplicate.
   */
  private idempotencyKey = createIdempotencyKey();

  protected readonly form = new FormGroup({
    amount: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    paymentMethod: new FormControl<PaymentMethod>('CASH', { nonNullable: true }),
    payerType: new FormControl<PayerType>('SELF', { nonNullable: true }),
    guardianId: new FormControl<string | null>(null),
    payerLabel: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
  });

  /** True when this drawer is pre-filling a corrected payment. */
  protected readonly isCorrection = computed(() => this.store.correctionPrefill() !== null);

  constructor() {
    // When a correction prefill is available, apply it to the form once
    effect(() => {
      const prefill = this.store.correctionPrefill();
      if (prefill) {
        this.form.patchValue({
          paymentMethod: prefill.paymentMethod,
          payerType: prefill.payerType,
          guardianId: prefill.guardianId,
        });
      }
    }, { allowSignalWrites: false });
  }

  protected readonly currency = computed(() => this.summary()?.currency ?? 'TND');

  /** Live validation of what the user typed, in the clinic's currency. */
  protected readonly amountError = computed(() => {
    const raw = this.form.controls.amount.value;
    if (!this.form.controls.amount.touched || raw.trim().length === 0) {
      return null;
    }
    return parseAmount(raw, this.currency()).error;
  });

  protected readonly guardianRequired = computed(
    () => this.form.controls.payerType.value === 'GUARDIAN',
  );

  protected money(amountMinor: number | null): string {
    return amountMinor === null ? '—' : formatMoney(amountMinor, this.currency());
  }

  protected close(): void {
    this.form.reset({
      amount: '',
      paymentMethod: 'CASH',
      payerType: 'SELF',
      guardianId: null,
      payerLabel: '',
      note: '',
    });
    // A new key for the next payment: the previous one is spent.
    this.idempotencyKey = createIdempotencyKey();
    this.closed.emit();
  }

  /**
   * Submits the payment.
   *
   * `allowOverpayment` is only ever sent as the explicit answer to a warning
   * the server already raised — never speculatively on a first attempt.
   */
  protected async submit(allowOverpayment = false): Promise<void> {
    // Guard against a double-submit that beats the disabled attribute.
    if (this.store.isSubmitting()) {
      return;
    }

    this.form.markAllAsTouched();
    this.form.controls.amount.markAsTouched();
    this.form.controls.guardianId.markAsTouched();

    const value = this.form.getRawValue();
    const parsed = parseAmount(value.amount, this.currency());

    if (parsed.amountMinor === null) {
      return;
    }
    if (value.payerType === 'GUARDIAN' && !value.guardianId) {
      return;
    }

    const prefill = this.store.correctionPrefill();
    const targetTreatmentId = this.treatmentId() ?? prefill?.treatmentId ?? null;

    await this.store.record(
      {
        treatmentId: targetTreatmentId,
        payerType: value.payerType,
        guardianId: value.payerType === 'GUARDIAN' ? value.guardianId : null,
        payerLabel: value.payerType === 'OTHER' ? value.payerLabel.trim() || null : null,
        amount: value.amount.trim().replace(',', '.'),
        paymentMethod: value.paymentMethod,
        note: value.note.trim() || null,
        idempotencyKey: this.idempotencyKey,
        ...(allowOverpayment ? { allowOverpayment: true } : {}),
        // Include correction link when this drawer was opened for a correction
        ...(prefill ? { correctionOfRecordId: prefill.correctionOfRecordId } : {}),
      },
      targetTreatmentId,
    );
  }

  protected confirmOverpayment(): void {
    void this.submit(true);
  }

  protected viewReceipt(): void {
    const record = this.store.lastRecorded();
    if (record) {
      void this.store.openReceipt(record.id);
    }
  }

  protected done(): void {
    this.close();
  }
}

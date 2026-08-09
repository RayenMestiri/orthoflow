import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom, startWith } from 'rxjs';
import { FinanceApiService } from '../../../finance/data-access/finance.api';
import { isTreatmentPayable, type PatientBalance } from '../../../finance/models/finance.models';
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
  /** Preselected course of care, e.g. when opened from a balance row. */
  readonly treatmentId = input<string | null>(null);
  readonly patientId = input<string | null>(null);
  readonly guardians = input<DrawerGuardian[]>([]);
  readonly summary = input<FinancialSummary | null>(null);

  private readonly finance = inject(FinanceApiService);

  /** Declared before the form so the mirroring signal can subscribe to it. */
  protected readonly treatmentControl = new FormControl('', { nonNullable: true });

  /** Every treatment for this patient that may currently receive money. */
  protected readonly payableTreatments = signal<PatientBalance[]>([]);
  protected readonly treatmentsLoading = signal(false);
  protected readonly treatmentsLoaded = signal(false);

  /**
   * The course of care this payment will be attached to.
   *
   * Held in the reactive form rather than a bare signal: binding `[value]` on a
   * `<select>` whose options are rendered by `@for` does not reliably sync the
   * DOM selection, so the drawer could show one treatment while holding
   * another. `formControlName` goes through Angular's select accessor, which
   * keeps the two in step. The signal below mirrors it for the computeds.
   */
  private readonly treatmentControlValue = toSignal(
    this.treatmentControl.valueChanges.pipe(startWith(this.treatmentControl.value)),
    { initialValue: '' },
  );

  protected readonly selectedTreatmentId = computed(() => this.treatmentControlValue() || null);
  /** Set when a submit was blocked for want of a choice, so the field can say so. */
  protected readonly treatmentTouched = signal(false);

  protected readonly selectedTreatment = computed(
    () =>
      this.payableTreatments().find(
        (treatment) => treatment.treatmentId === this.selectedTreatmentId(),
      ) ?? null,
  );

  /** With one option there is nothing to choose; the drawer just states it. */
  protected readonly needsTreatmentChoice = computed(() => this.payableTreatments().length > 1);

  protected readonly hasNoPayableTreatment = computed(
    () => this.treatmentsLoaded() && this.payableTreatments().length === 0,
  );

  /**
   * The summary the drawer shows.
   *
   * Prefers the selected treatment's own figures — that is the balance the
   * payment actually lands against — and falls back to whatever the workspace
   * passed in when no treatment is in play.
   */
  protected readonly effectiveSummary = computed<FinancialSummary | null>(() => {
    const treatment = this.selectedTreatment();
    if (!treatment) {
      return this.summary();
    }
    return {
      patientId: treatment.patientId,
      treatmentId: treatment.treatmentId,
      currency: this.summary()?.currency ?? 'TND',
      agreedAmountMinor: treatment.agreedMinor,
      recordedAmountMinor: treatment.recordedMinor,
      remainingAmountMinor: treatment.remainingMinor,
      recordCount: 0,
      cancelledCount: 0,
    };
  });

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
    effect(
      () => {
        const prefill = this.store.correctionPrefill();
        if (prefill) {
          this.form.patchValue({
            paymentMethod: prefill.paymentMethod,
            payerType: prefill.payerType,
            guardianId: prefill.guardianId,
          });
        }
      },
      { allowSignalWrites: false },
    );

    // Load the patient's payable treatments as soon as the drawer knows who
    // it is for. Without this the drawer could only ever offer whatever a
    // caller happened to pass in — which is how it came to show
    // "No treatment selected" with no way to fix it.
    effect(() => {
      const patientId = this.patientId();
      if (patientId) {
        void this.loadTreatments(patientId);
      }
    });
  }

  private async loadTreatments(patientId: string): Promise<void> {
    this.treatmentsLoading.set(true);
    try {
      const all = await firstValueFrom(this.finance.treatmentsForPatient(patientId));
      const payable = all.filter((treatment) =>
        isTreatmentPayable(treatment.treatmentStatus, treatment.remainingMinor),
      );
      this.payableTreatments.set(payable);

      // Preselect the row the user came from when it is still payable;
      // otherwise auto-select when there is exactly one real choice.
      const preselected = this.treatmentId();
      const preselectable = payable.some((treatment) => treatment.treatmentId === preselected);
      if (preselected && preselectable) {
        this.treatmentControl.setValue(preselected);
      } else if (payable.length === 1) {
        this.treatmentControl.setValue(payable[0]?.treatmentId ?? '');
      }
    } catch {
      // A failed lookup must not block a deposit that needs no treatment, so
      // the drawer degrades to the no-treatment path rather than erroring out.
      this.payableTreatments.set([]);
    } finally {
      this.treatmentsLoading.set(false);
      this.treatmentsLoaded.set(true);
    }
  }

  /** The control already carries the value; this only clears stale feedback. */
  protected onTreatmentChanged(): void {
    // Any pending overpayment warning belonged to the previous balance.
    this.store.dismissOverpaymentWarning();
  }

  /** `Metal braces · ACTIVE · 200.000 TND remaining` */
  protected treatmentOptionLabel(treatment: PatientBalance): string {
    const remaining =
      treatment.remainingMinor === null
        ? 'no agreed price'
        : `${formatMoney(treatment.remainingMinor, this.currency())} remaining`;
    return `${treatment.treatmentLabel} · ${treatment.treatmentStatus} · ${remaining}`;
  }

  /** Currency comes from the workspace summary; a treatment never changes it. */
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

    // A choice is mandatory once there is more than one payable course of care:
    // guessing which one absorbs the money is exactly the bug being fixed.
    if (this.needsTreatmentChoice() && !this.selectedTreatmentId()) {
      this.treatmentTouched.set(true);
      return;
    }

    const prefill = this.store.correctionPrefill();
    const targetTreatmentId =
      this.selectedTreatmentId() ?? this.treatmentId() ?? prefill?.treatmentId ?? null;

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

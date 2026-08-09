import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CashRecord } from '../models/cash-record.model';
import type { FinancialSummary } from '../models/financial-summary.model';
import type { ReceiptDocument } from '../models/receipt.model';
import { CashRecordApiService } from './cash-record.api';
import { CashRecordStore } from './cash-record.store';

/** The store reads problems through `getApiProblem`, which needs a real response. */
function apiError(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { success: false, error: { code, message, details } },
  });
}

function record(overrides: Partial<CashRecord> = {}): CashRecord {
  return {
    id: 'record-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    treatmentId: 'treatment-1',
    payerType: 'GUARDIAN',
    guardianId: 'guardian-1',
    payerLabel: null,
    payerName: 'Fatma Ben Salah',
    amountMinor: 500_000,
    amountFormatted: '500.000',
    currency: 'TND',
    paymentMethod: 'CASH',
    receivedAt: '2026-08-09T09:42:00.000Z',
    receivedByUserId: 'user-1',
    receivedByName: 'Sarah Gharbi',
    purpose: null,
    note: null,
    status: 'RECORDED',
    receiptId: 'receipt-1',
    receiptNumber: 'REC-2026-000042',
    overpaymentOverride: false,
    cancelledAt: null,
    cancelledByName: null,
    cancellationReason: null,
    correctedByRecordId: null,
    correctionOfRecordId: null,
    createdAt: '2026-08-09T09:42:00.000Z',
    ...overrides,
  };
}

function summary(overrides: Partial<FinancialSummary> = {}): FinancialSummary {
  return {
    patientId: 'patient-1',
    treatmentId: null,
    currency: 'TND',
    agreedAmountMinor: null,
    recordedAmountMinor: 500_000,
    remainingAmountMinor: null,
    recordCount: 1,
    cancelledCount: 0,
    ...overrides,
  };
}

describe('CashRecordStore', () => {
  let store: CashRecordStore;
  let api: {
    listForPatient: ReturnType<typeof vi.fn>;
    patientSummary: ReturnType<typeof vi.fn>;
    treatmentSummary: ReturnType<typeof vi.fn>;
    record: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    receiptFor: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      listForPatient: vi.fn(() =>
        of({ items: [record()], page: 1, limit: 20, total: 1, pages: 1 }),
      ),
      patientSummary: vi.fn(() => of(summary())),
      treatmentSummary: vi.fn(() =>
        of(
          summary({
            treatmentId: 'treatment-1',
            agreedAmountMinor: 3_600_000,
            remainingAmountMinor: 3_100_000,
          }),
        ),
      ),
      record: vi.fn(() => of(record())),
      cancel: vi.fn(() => of(record({ status: 'CANCELLED' }))),
      receiptFor: vi.fn(() => of({ receiptNumber: 'REC-2026-000042' } as ReceiptDocument)),
    };

    TestBed.configureTestingModule({
      providers: [CashRecordStore, { provide: CashRecordApiService, useValue: api }],
    });
    store = TestBed.inject(CashRecordStore);
  });

  describe('loading', () => {
    it('loads history and totals together, once', async () => {
      await store.load('patient-1');
      await store.load('patient-1');

      expect(api.listForPatient).toHaveBeenCalledTimes(1);
      expect(api.patientSummary).toHaveBeenCalledTimes(1);
      expect(store.records()).toHaveLength(1);
      expect(store.isLoaded()).toBe(true);
    });

    it('reads the treatment summary when a treatment is in scope', async () => {
      await store.load('patient-1', 'treatment-1');

      expect(api.treatmentSummary).toHaveBeenCalledWith('treatment-1');
      // The treatment summary wins, because only it can show a balance.
      expect(store.activeSummary()?.agreedAmountMinor).toBe(3_600_000);
      expect(store.activeSummary()?.remainingAmountMinor).toBe(3_100_000);
    });

    it('falls back to the patient summary with no treatment', async () => {
      await store.load('patient-1');

      expect(api.treatmentSummary).not.toHaveBeenCalled();
      expect(store.activeSummary()?.agreedAmountMinor).toBeNull();
    });

    it('drops the previous patient file when the id changes', async () => {
      await store.load('patient-1');
      api.listForPatient.mockReturnValueOnce(
        of({ items: [], page: 1, limit: 20, total: 0, pages: 0 }),
      );

      await store.load('patient-2');

      expect(api.listForPatient).toHaveBeenLastCalledWith('patient-2');
      expect(store.records()).toEqual([]);
    });

    it('surfaces the server message when the workspace cannot be read', async () => {
      api.patientSummary.mockReturnValueOnce(
        throwError(() => apiError('PATIENT_NOT_FOUND', 'Patient not found', 404)),
      );

      await store.load('patient-1');

      expect(store.error()).toBe('Patient not found');
      expect(store.isLoaded()).toBe(false);
    });
  });

  describe('history view', () => {
    beforeEach(async () => {
      api.listForPatient.mockReturnValue(
        of({
          items: [record({ id: 'a' }), record({ id: 'b', status: 'CANCELLED' })],
          page: 1,
          limit: 20,
          total: 2,
          pages: 1,
        }),
      );
      await store.load('patient-1');
    });

    it('shows everything by default, cancelled records included', () => {
      expect(store.visibleRecords()).toHaveLength(2);
      // Cancelled money stays visible but stops counting.
      expect(store.activeRecordCount()).toBe(1);
    });

    it('filters to recorded or cancelled', () => {
      store.setFilter('RECORDED');
      expect(store.visibleRecords().map((item) => item.id)).toEqual(['a']);

      store.setFilter('CANCELLED');
      expect(store.visibleRecords().map((item) => item.id)).toEqual(['b']);
    });
  });

  describe('recording a payment', () => {
    beforeEach(async () => {
      await store.load('patient-1');
    });

    it('refreshes history and totals after a successful record', async () => {
      const saved = await store.record({
        payerType: 'SELF',
        amount: '200.000',
        paymentMethod: 'CASH',
        idempotencyKey: 'submit-abc-1234',
      });

      expect(saved).not.toBeNull();
      expect(api.record).toHaveBeenCalledWith(
        'patient-1',
        expect.objectContaining({ amount: '200.000', idempotencyKey: 'submit-abc-1234' }),
      );
      // Once on load, once after the write — totals never drift from the server.
      expect(api.patientSummary).toHaveBeenCalledTimes(2);
      expect(store.lastRecorded()?.id).toBe('record-1');
    });

    it('captures an overpayment reply as a warning, not a raw error', async () => {
      api.record.mockReturnValueOnce(
        throwError(() =>
          apiError(
            'PAYMENT_EXCEEDS_REMAINING_AMOUNT',
            'This payment exceeds the amount still owed on the treatment',
            422,
            {
              requiresConfirmation: true,
              currency: 'TND',
              remainingAmountMinor: 100_000,
              amountMinor: 200_000,
              excessAmountMinor: 100_000,
              overrideAllowed: true,
            },
          ),
        ),
      );

      const saved = await store.record({
        payerType: 'SELF',
        amount: '200.000',
        paymentMethod: 'CASH',
        idempotencyKey: 'submit-abc-1234',
      });

      expect(saved).toBeNull();
      expect(store.overpaymentWarning()).toMatchObject({
        excessAmountMinor: 100_000,
        overrideAllowed: true,
      });
      // It is a question, not a failure, so no error banner appears.
      expect(store.error()).toBeNull();
    });

    it('reports other failures as errors', async () => {
      api.record.mockReturnValueOnce(
        throwError(() =>
          apiError('GUARDIAN_NOT_LINKED_TO_PATIENT', 'That guardian is not linked', 422),
        ),
      );

      await store.record({
        payerType: 'GUARDIAN',
        guardianId: 'guardian-9',
        amount: '200.000',
        paymentMethod: 'CASH',
        idempotencyKey: 'submit-abc-1234',
      });

      expect(store.error()).toBe('That guardian is not linked');
      expect(store.overpaymentWarning()).toBeNull();
    });

    it('refuses to write before a patient is loaded', async () => {
      const fresh = TestBed.inject(CashRecordStore);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [CashRecordStore, { provide: CashRecordApiService, useValue: api }],
      });
      const empty = TestBed.inject(CashRecordStore);
      expect(fresh).toBeDefined();

      const saved = await empty.record({
        payerType: 'SELF',
        amount: '200.000',
        paymentMethod: 'CASH',
        idempotencyKey: 'submit-abc-1234',
      });

      expect(saved).toBeNull();
    });
  });

  describe('cancelling', () => {
    beforeEach(async () => {
      await store.load('patient-1');
    });

    it('refreshes totals and closes the drawer', async () => {
      store.openCancelDrawer(record());

      const cancelled = await store.cancel('record-1', 'Incorrect amount');

      expect(cancelled).toBe(true);
      expect(api.cancel).toHaveBeenCalledWith('record-1', 'Incorrect amount');
      expect(store.drawerMode()).toBeNull();
      expect(api.listForPatient).toHaveBeenCalledTimes(2);
    });

    it('keeps the drawer open and reports the reason it failed', async () => {
      store.openCancelDrawer(record());
      api.cancel.mockReturnValueOnce(
        throwError(() =>
          apiError(
            'CASH_RECORD_ALREADY_CANCELLED',
            'This payment record is already cancelled',
            422,
          ),
        ),
      );

      const cancelled = await store.cancel('record-1', 'Incorrect amount');

      expect(cancelled).toBe(false);
      expect(store.error()).toBe('This payment record is already cancelled');
      expect(store.drawerMode()).toBe('cancel');
    });
  });

  describe('drawer and receipt', () => {
    beforeEach(async () => {
      await store.load('patient-1');
    });

    it('clears a stale warning when the record drawer reopens', async () => {
      api.record.mockReturnValueOnce(
        throwError(() =>
          apiError('PAYMENT_EXCEEDS_REMAINING_AMOUNT', 'Too much', 422, {
            requiresConfirmation: true,
            overrideAllowed: true,
          }),
        ),
      );
      await store.record({
        payerType: 'SELF',
        amount: '900.000',
        paymentMethod: 'CASH',
        idempotencyKey: 'submit-abc-1234',
      });
      expect(store.overpaymentWarning()).not.toBeNull();

      store.openRecordDrawer();

      expect(store.overpaymentWarning()).toBeNull();
      expect(store.lastRecorded()).toBeNull();
    });

    it('refuses to close the drawer mid-submission', async () => {
      store.openRecordDrawer();
      // A payment in flight: the drawer must not vanish under the user, and a
      // second click must not start a second submission.
      const inFlight = new Subject<CashRecord>();
      api.record.mockReturnValueOnce(inFlight.asObservable());

      const pending = store.record({
        payerType: 'SELF',
        amount: '200.000',
        paymentMethod: 'CASH',
        idempotencyKey: 'submit-abc-1234',
      });

      expect(store.isSubmitting()).toBe(true);
      store.closeDrawer();
      expect(store.drawerMode()).toBe('record');

      inFlight.next(record());
      inFlight.complete();
      await pending;

      expect(store.isSubmitting()).toBe(false);
    });

    it('loads a receipt on demand and closes it again', async () => {
      await store.openReceipt('record-1');
      expect(store.receipt()?.receiptNumber).toBe('REC-2026-000042');

      store.closeReceipt();
      expect(store.receipt()).toBeNull();
    });

    it('reports a receipt that cannot be read', async () => {
      api.receiptFor.mockReturnValueOnce(
        throwError(() => apiError('RECEIPT_NOT_FOUND', 'Receipt not found', 404)),
      );

      await store.openReceipt('record-1');

      expect(store.error()).toBe('Receipt not found');
    });
  });
});

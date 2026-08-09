import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceApiService } from '../../../finance/data-access/finance.api';
import type { PatientBalance } from '../../../finance/models/finance.models';
import { CashRecordApiService } from '../../data-access/cash-record.api';
import { CashRecordStore } from '../../data-access/cash-record.store';
import { RecordPaymentDrawer } from './record-payment-drawer';

const PATIENT_ID = 'patient-1';

function treatment(overrides: Partial<PatientBalance> = {}): PatientBalance {
  return {
    patientId: PATIENT_ID,
    patientName: 'Rayen Mestiri',
    treatmentId: 'treatment-active',
    treatmentLabel: 'Metal braces',
    treatmentStatus: 'ACTIVE',
    agreedMinor: 1_000_000,
    recordedMinor: 800_000,
    remainingMinor: 200_000,
    overpaidMinor: null,
    paymentStatus: 'PARTIALLY_PAID',
    lastPaymentAt: null,
    ...overrides,
  };
}

describe('RecordPaymentDrawer — treatment selection', () => {
  let fixture: ComponentFixture<RecordPaymentDrawer>;
  let finance: { treatmentsForPatient: ReturnType<typeof vi.fn> };
  let cashApi: Record<string, ReturnType<typeof vi.fn>>;

  async function render(
    treatments: PatientBalance[],
    preselectTreatmentId: string | null = null,
  ): Promise<HTMLElement> {
    finance.treatmentsForPatient.mockReturnValue(of(treatments));
    fixture = TestBed.createComponent(RecordPaymentDrawer);
    fixture.componentRef.setInput('patientId', PATIENT_ID);
    fixture.componentRef.setInput('patientName', 'Rayen Mestiri');
    fixture.componentRef.setInput('treatmentId', preselectTreatmentId);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function selector(element: HTMLElement): HTMLSelectElement | null {
    return element.querySelector('#pay-treatment');
  }

  beforeEach(() => {
    finance = { treatmentsForPatient: vi.fn(() => of([])) };
    cashApi = {
      listForPatient: vi.fn(() => of({ items: [], page: 1, limit: 20, total: 0, pages: 0 })),
      patientSummary: vi.fn(() => of(null)),
      treatmentSummary: vi.fn(() => of(null)),
      record: vi.fn(() => of({})),
      cancel: vi.fn(() => of({})),
      receiptFor: vi.fn(() => of({})),
    };

    TestBed.configureTestingModule({
      imports: [RecordPaymentDrawer],
      providers: [
        CashRecordStore,
        { provide: FinanceApiService, useValue: finance },
        { provide: CashRecordApiService, useValue: cashApi },
      ],
    });
  });

  it('auto-selects when the patient has exactly one payable treatment', async () => {
    const element = await render([treatment()]);

    // Nothing to choose, so no selector is rendered at all.
    expect(selector(element)).toBeNull();
    expect(element.textContent).toContain('Metal braces');
    expect(element.textContent).toContain('200.000 TND remaining');
  });

  it('requires a choice when several treatments are payable', async () => {
    const element = await render([
      treatment(),
      treatment({
        treatmentId: 'treatment-completed',
        treatmentLabel: 'Functional appliance',
        treatmentStatus: 'COMPLETED',
        agreedMinor: 1_000_000,
        recordedMinor: 0,
        remainingMinor: 1_000_000,
      }),
    ]);

    const select = selector(element);
    expect(select).not.toBeNull();
    // Placeholder plus both treatments, and nothing preselected.
    expect(select?.querySelectorAll('option')).toHaveLength(3);
    expect(select?.value).toBe('');
    expect(element.textContent).toContain('Functional appliance · COMPLETED');
  });

  it('keeps a completed treatment that still owes money', async () => {
    const element = await render([
      treatment({
        treatmentId: 'treatment-completed',
        treatmentLabel: 'Clear aligners',
        treatmentStatus: 'COMPLETED',
        remainingMinor: 300_000,
      }),
    ]);

    expect(element.textContent).toContain('Clear aligners');
    expect(element.textContent).toContain('300.000 TND remaining');
  });

  it('drops a fully paid completed treatment and a cancelled one', async () => {
    const element = await render([
      treatment(),
      treatment({
        treatmentId: 'settled',
        treatmentLabel: 'Retainer',
        treatmentStatus: 'COMPLETED',
        remainingMinor: 0,
        paymentStatus: 'PAID',
      }),
      treatment({
        treatmentId: 'cancelled',
        treatmentLabel: 'Abandoned plan',
        treatmentStatus: 'CANCELLED',
        remainingMinor: 500_000,
      }),
    ]);

    // Only the active one survives, so it auto-selects and no selector shows.
    expect(selector(element)).toBeNull();
    expect(element.textContent).toContain('Metal braces');
    expect(element.textContent).not.toContain('Retainer');
    expect(element.textContent).not.toContain('Abandoned plan');
  });

  it('preselects the treatment the user opened the drawer from', async () => {
    const element = await render(
      [
        treatment(),
        treatment({
          treatmentId: 'treatment-second',
          treatmentLabel: 'Functional appliance',
          remainingMinor: 1_000_000,
        }),
      ],
      'treatment-second',
    );

    expect(selector(element)?.value).toBe('treatment-second');
    expect(element.textContent).toContain('1000.000 TND');
  });

  it('ignores a preselection that is not payable', async () => {
    const element = await render(
      [treatment(), treatment({ treatmentId: 'other' })],
      'cancelled-id',
    );

    // The stale id is dropped rather than silently attaching money to it.
    expect(selector(element)?.value).toBe('');
  });

  it('shows the selected treatment balance and updates it on change', async () => {
    const element = await render([
      treatment(),
      treatment({
        treatmentId: 'treatment-second',
        treatmentLabel: 'Functional appliance',
        agreedMinor: 2_000_000,
        recordedMinor: 500_000,
        remainingMinor: 1_500_000,
      }),
    ]);

    const select = selector(element) as HTMLSelectElement;
    select.value = 'treatment-second';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // The summary follows the choice, so the amount field warns against the
    // balance the money is actually landing on.
    expect(element.textContent).toContain('2000.000 TND');
    expect(element.textContent).toContain('1500.000 TND');
  });

  it('explains itself when the patient has nothing payable', async () => {
    const element = await render([
      treatment({ treatmentStatus: 'CANCELLED', treatmentId: 'cancelled-only' }),
    ]);

    expect(element.textContent).toContain('No payable treatment found for this patient.');
    // Never the old bare label with no explanation.
    expect(element.textContent).not.toContain('No treatment selected');
  });

  it('degrades to the no-treatment path when the lookup fails', async () => {
    finance.treatmentsForPatient.mockReturnValue(throwError(() => new Error('offline')));
    fixture = TestBed.createComponent(RecordPaymentDrawer);
    fixture.componentRef.setInput('patientId', PATIENT_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    // A deposit that needs no treatment must still be recordable.
    expect(element.textContent).toContain('No payable treatment found');
  });
});

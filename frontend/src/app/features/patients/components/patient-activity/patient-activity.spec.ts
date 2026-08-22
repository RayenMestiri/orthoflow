import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicSettingsStore } from '../../../settings/data-access/clinic-settings.store';
import { PatientsApiService } from '../../data-access/patients-api.service';
import type { PatientActivity, PaginatedData } from '../../models/patient.models';
import { PatientActivityTimeline } from './patient-activity';

function activity(overrides: Partial<PatientActivity> = {}): PatientActivity {
  return {
    id: 'event-1',
    category: 'PAYMENT',
    type: 'PAYMENT_RECORDED',
    occurredAt: new Date().toISOString(),
    title: 'Paiement enregistré',
    subtitle: 'Bagues métalliques · Reçu REC-2026-000048',
    detail: 'Payé par Mohamed Salah',
    actor: { displayName: 'Sarah Trabelsi', role: 'SECRETARY' },
    treatment: { id: '652f1c9b8a1e4f0012ab0001', label: 'Bagues métalliques' },
    appointmentId: null,
    clinicalVisitId: null,
    cashRecordId: '652f1c9b8a1e4f0012ab0002',
    receiptId: '652f1c9b8a1e4f0012ab0003',
    mediaId: null,
    amountMinor: 200_000,
    currency: 'TND',
    receiptNumber: 'REC-2026-000048',
    scheduledAt: null,
    recommendedAt: null,
    cancellationReason: null,
    targetType: 'CASH_RECORD',
    targetId: '652f1c9b8a1e4f0012ab0002',
    ...overrides,
  };
}

function page(items: PatientActivity[], total = items.length): PaginatedData<PatientActivity> {
  return { items, total, page: 1, limit: 20, pages: Math.ceil(total / 20) };
}

describe('PatientActivityTimeline', () => {
  let fixture: ComponentFixture<PatientActivityTimeline>;
  let api: { activity: ReturnType<typeof vi.fn> };

  async function render(
    items: PatientActivity[] = [activity()],
    total = items.length,
  ): Promise<HTMLElement> {
    api.activity.mockReturnValue(of(page(items, total)));
    fixture = TestBed.createComponent(PatientActivityTimeline);
    fixture.componentRef.setInput('patientId', 'patient-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    api = { activity: vi.fn() };
    TestBed.configureTestingModule({
      imports: [PatientActivityTimeline],
      providers: [
        provideRouter([]),
        { provide: PatientsApiService, useValue: api },
        {
          provide: ClinicSettingsStore,
          useValue: {
            settings: signal({ general: { timezone: 'Africa/Tunis' } }),
            load: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    });
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('groups events by clinic day and renders payment, receipt and actor context', async () => {
    const element = await render([
      activity(),
      activity({
        id: 'event-2',
        category: 'CLINICAL',
        type: 'CLINICAL_VISIT_COMPLETED',
        occurredAt: new Date(Date.now() - 86_400_000).toISOString(),
        title: 'Consultation terminée',
        subtitle: 'Consultation orthodontique',
        detail: "Changement d'arc · Consignes élastiques",
        amountMinor: null,
        currency: null,
        receiptNumber: null,
        targetType: 'CLINICAL_VISIT',
        targetId: 'visit-1',
      }),
    ]);

    expect(element.textContent).toContain('AUJOURD’HUI');
    expect(element.textContent).toContain('HIER');
    expect(element.textContent).toContain('+200.000 TND');
    expect(element.textContent).toContain('REC-2026-000048');
    expect(element.textContent).toContain('Sarah Trabelsi');
    expect(element.textContent).toContain("Changement d'arc · Consignes élastiques");
  });

  it('reloads from page one when a filter changes', async () => {
    const element = await render();
    api.activity.mockReturnValue(of(page([])));

    const clinical = [...element.querySelectorAll('.patient-activity__filters button')].find(
      (button) => button.textContent?.trim() === 'Clinique',
    ) as HTMLButtonElement;
    clinical.click();
    await fixture.whenStable();

    expect(api.activity).toHaveBeenLastCalledWith('patient-1', 1, 20, 'CLINICAL');
  });

  it('loads earlier activity without replacing current rows', async () => {
    const first = activity();
    const element = await render([first], 2);
    api.activity.mockReturnValue(
      of(page([activity({ id: 'event-2', category: 'DOCUMENT', title: 'Document ajouté' })], 2)),
    );
    const loadMoreBtn = element.querySelector('.btn-load-more') as HTMLButtonElement;
    loadMoreBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.activity).toHaveBeenLastCalledWith('patient-1', 2, 20, 'ALL');
    expect(element.textContent).toContain('Paiement enregistré');
    expect(element.textContent).toContain('Document ajouté');
  });

  it('renders a retryable error state', async () => {
    api.activity.mockReturnValue(throwError(() => new Error('offline')));
    fixture = TestBed.createComponent(PatientActivityTimeline);
    fixture.componentRef.setInput('patientId', 'patient-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Impossible de charger l’historique');
    expect(element.textContent).toContain('Réessayer');
  });

  it('reuses the existing patient section for payment events', async () => {
    const element = await render();
    const emitted = vi.fn();
    fixture.componentInstance.sectionRequested.subscribe(emitted);

    (element.querySelector('.activity-row') as HTMLElement).click();

    expect(emitted).toHaveBeenCalledWith('CASH_RECORD');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionService } from '../../../../core/auth/permissions';
import { ClinicalVisitsApiService } from '../../../clinical-visits/data-access/clinical-visits-api.service';
import { TreatmentsApiService } from '../../data-access/treatments-api.service';
import type { TreatmentWithMilestones } from '../../models/treatment.models';
import { PatientTreatments } from './patient-treatments';

function treatment(overrides: Partial<TreatmentWithMilestones> = {}): TreatmentWithMilestones {
  return {
    id: 'treatment-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    type: 'METAL_BRACES',
    customTypeLabel: null,
    status: 'ACTIVE',
    startDate: '2026-02-12',
    expectedEndDate: '2028-02-12',
    completedAt: null,
    agreedPrice: 3600,
    notes: 'Class II correction with fixed appliances.',
    cancellationReason: null,
    durationDays: 90,
    isCurrent: true,
    createdBy: 'doctor-1',
    updatedBy: null,
    createdAt: '2026-02-12T09:00:00.000Z',
    updatedAt: '2026-02-12T09:00:00.000Z',
    milestones: [
      {
        id: 'milestone-1',
        treatmentId: 'treatment-1',
        patientId: 'patient-1',
        type: 'APPLIANCE_FITTED',
        title: 'Upper and lower appliance fitted',
        description: 'Home-care instructions reviewed.',
        occurredAt: '2026-03-02T10:00:00.000Z',
        createdBy: 'doctor-1',
        updatedBy: null,
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('PatientTreatments', () => {
  let fixture: ComponentFixture<PatientTreatments>;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let clinicalApi: Record<string, ReturnType<typeof vi.fn>>;

  async function render(items: TreatmentWithMilestones[]): Promise<HTMLElement> {
    api['listForPatient']?.mockReturnValue(of(items));
    fixture = TestBed.createComponent(PatientTreatments);
    fixture.componentRef.setInput('patientId', 'patient-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    api = {
      listForPatient: vi.fn(() => of([])),
      create: vi.fn(() => of(treatment())),
      update: vi.fn(() => of(treatment())),
      start: vi.fn(() => of(treatment())),
      pause: vi.fn(() => of(treatment({ status: 'PAUSED', isCurrent: false }))),
      resume: vi.fn(() => of(treatment())),
      complete: vi.fn(() => of(treatment({ status: 'COMPLETED', isCurrent: false }))),
      cancel: vi.fn(() => of(treatment({ status: 'CANCELLED', isCurrent: false }))),
      addMilestone: vi.fn(() => of(treatment().milestones[0])),
      updateMilestone: vi.fn(() => of(treatment().milestones[0])),
    };
    clinicalApi = { listForPatient: vi.fn(() => of([])) };
    TestBed.configureTestingModule({
      imports: [PatientTreatments],
      providers: [
        provideRouter([]),
        { provide: TreatmentsApiService, useValue: api },
        { provide: ClinicalVisitsApiService, useValue: clinicalApi },
        { provide: PermissionService, useValue: { can: () => true } },
      ],
    });
  });

  it('shows a useful empty state', async () => {
    const element = await render([]);
    expect(element.textContent).toContain('No orthodontic treatment yet');
    expect(element.textContent).toContain('Create treatment');
  });

  it('surfaces appointment-linked clinical visits without copying them into treatment data', async () => {
    clinicalApi['listForPatient']?.mockReturnValue(
      of([
        {
          id: 'visit-1',
          appointmentId: 'appointment-1',
          treatmentId: 'treatment-1',
          status: 'COMPLETED',
          reasonCode: 'ROUTINE_ADJUSTMENT',
          reasonOther: null,
          procedures: ['EXAMINATION'],
          patientInstructions: null,
          nextVisitRecommendedAt: null,
          nextStepNote: null,
          startedAt: '2026-08-15T09:00:00.000Z',
          completedAt: '2026-08-15T09:30:00.000Z',
          clinicianName: 'Dr Amine',
        },
      ]),
    );
    const element = await render([treatment()]);
    expect(element.textContent).toContain('Recent clinical visits');
    expect(element.textContent).toContain('Routine adjustment');
    expect(element.querySelector('a[href="/app/clinical-visits/visit-1"]')).not.toBeNull();
  });

  it('renders the active summary, persisted timeline and treatment history', async () => {
    const element = await render([
      treatment(),
      treatment({
        id: 'treatment-old',
        type: 'FUNCTIONAL_APPLIANCE',
        status: 'COMPLETED',
        completedAt: '2025-09-01T10:00:00.000Z',
        isCurrent: false,
        milestones: [],
      }),
    ]);
    expect(element.textContent).toContain('Metal braces');
    expect(element.textContent).toContain('Upper and lower appliance fitted');
    expect(element.textContent).toContain('Previous treatments');
  });

  it('keeps OTHER invalid until a custom treatment label is entered', async () => {
    const element = await render([]);
    (element.querySelector('.tx-empty .tx-btn--primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    const select = element.querySelector('select[formControlName="type"]') as HTMLSelectElement;
    select.value = 'OTHER';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    (element.querySelector('.tx-drawer__form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api['create']).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Enter a custom treatment type');
  });

  it('clears startDate when a new treatment is changed to PLANNED', async () => {
    const element = await render([]);
    (element.querySelector('.tx-empty .tx-btn--primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    const status = element.querySelector('select[formControlName="status"]') as HTMLSelectElement;
    status.value = 'PLANNED';
    status.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const startDate = element.querySelector(
      'input[formControlName="startDate"]',
    ) as HTMLInputElement;
    expect(startDate.value).toBe('');
  });

  it('runs the contextual pause action and reloads persisted state', async () => {
    const element = await render([treatment()]);
    const pauseButton = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Pause'),
    );
    pauseButton?.click();
    await fixture.whenStable();
    expect(api['pause']).toHaveBeenCalledWith('treatment-1', undefined);
    expect(api['listForPatient']).toHaveBeenCalledTimes(2);
  });
});

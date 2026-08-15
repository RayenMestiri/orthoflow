import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { ClinicalVisitsApiService } from '../../data-access/clinical-visits-api.service';
import { FollowUpsApiService } from '../../../follow-ups/data-access/follow-ups-api.service';
import type { ClinicalVisit } from '../../models/clinical-visit.models';
import { ClinicalVisitPage } from './clinical-visit-page';

const VISIT: ClinicalVisit = {
  id: 'visit-1',
  clinicId: 'clinic-1',
  patientId: 'patient-1',
  appointmentId: 'appointment-1',
  treatmentId: 'treatment-1',
  status: 'DRAFT',
  reasonCode: 'ROUTINE_ADJUSTMENT',
  reasonOther: null,
  observations: 'Alignment improving',
  procedures: ['EXAMINATION'],
  procedureDetails: null,
  patientInstructions: null,
  doctorNote: null,
  nextVisitRecommendedAt: null,
  nextStepNote: null,
  startedAt: '2026-08-15T09:00:00.000Z',
  completedAt: null,
  createdBy: 'owner-1',
  updatedBy: null,
  createdAt: '2026-08-15T09:00:00.000Z',
  updatedAt: '2026-08-15T09:00:00.000Z',
  context: {
    patient: { id: 'patient-1', fullName: 'Nadia Ben Ali' },
    appointment: {
      id: 'appointment-1',
      startAt: '2026-08-15T09:00:00.000Z',
      endAt: '2026-08-15T09:30:00.000Z',
      status: 'IN_TREATMENT',
    },
    treatment: { id: 'treatment-1', label: 'Clear aligners', status: 'ACTIVE' },
    previousVisit: null,
  },
};

describe('ClinicalVisitPage', () => {
  let fixture: ComponentFixture<ClinicalVisitPage>;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let followUpsApi: { list: ReturnType<typeof vi.fn> };
  const owner = true;

  beforeEach(async () => {
    api = {
      ensureForAppointment: vi.fn().mockReturnValue(of(VISIT)),
      get: vi.fn().mockReturnValue(of(VISIT)),
      update: vi.fn().mockReturnValue(of(VISIT)),
      complete: vi.fn().mockReturnValue(of({ ...VISIT, status: 'COMPLETED' })),
    };
    followUpsApi = {
      list: vi.fn().mockReturnValue(
        of({
          summary: { needsScheduling: 1, overdue: 0, scheduled: 0 },
          rows: [],
          pagination: { page: 1, limit: 10, total: 0, pages: 0 },
        }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [ClinicalVisitPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ appointmentId: 'appointment-1' }),
            },
          },
        },
        { provide: ClinicalVisitsApiService, useValue: api },
        {
          provide: FollowUpsApiService,
          useValue: followUpsApi,
        },
        {
          provide: PermissionService,
          useValue: {
            can: (permission: string) =>
              permission !== PERMISSIONS.CLINICAL_VISITS_EDIT_COMPLETED || owner,
          },
        },
      ],
    }).compileComponents();
  });

  async function render(visit: ClinicalVisit = VISIT): Promise<HTMLElement> {
    api['ensureForAppointment']?.mockReturnValue(of(visit));
    fixture = TestBed.createComponent(ClinicalVisitPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('opens the idempotent appointment-linked workspace with patient context', async () => {
    const element = await render();
    expect(api['ensureForAppointment']).toHaveBeenCalledWith('appointment-1');
    expect(element.textContent).toContain('Nadia Ben Ali');
    expect(element.textContent).toContain('Clear aligners');
    expect(element.querySelectorAll('.procedure-chips button').length).toBeGreaterThan(5);
  });

  it('saves a draft explicitly and retains the structured procedures', async () => {
    const element = await render();
    (
      element.querySelector('textarea[formcontrolname="observations"]') as HTMLTextAreaElement
    ).value = 'New finding';
    element
      .querySelector('textarea[formcontrolname="observations"]')
      ?.dispatchEvent(new Event('input'));
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(api['update']).toHaveBeenCalledWith(
      'visit-1',
      expect.objectContaining({ observations: 'New finding', procedures: ['EXAMINATION'] }),
    );
  });

  it('completes through the domain endpoint and renders the signed record read-only', async () => {
    const element = await render();
    const complete = [...element.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Complete visit'),
    ) as HTMLButtonElement;
    complete.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api['complete']).toHaveBeenCalledWith('visit-1', expect.any(Object));
    expect(element.textContent).toContain('Amend note');
  });

  it('keeps form data and exposes the backend error when saving fails', async () => {
    api['update']?.mockReturnValue(
      throwError(() => ({ error: { error: { message: 'Save failed' } } })),
    );
    const element = await render();
    const note = element.querySelector(
      'textarea[formcontrolname="doctorNote"]',
    ) as HTMLTextAreaElement;
    note.value = 'Keep this text';
    note.dispatchEvent(new Event('input'));
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(note.value).toBe('Keep this text');
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('shows a deliberate scheduling CTA after a recommendation is completed', async () => {
    const completed = {
      ...VISIT,
      status: 'COMPLETED' as const,
      completedAt: '2026-08-15T09:30:00.000Z',
      nextVisitRecommendedAt: '2026-09-12T12:00:00.000Z',
    };
    const element = await render(completed);
    expect(element.textContent).toContain('No appointment scheduled');
    const link = [...element.querySelectorAll('a')].find((item) =>
      item.textContent?.includes('Schedule next appointment'),
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('patientId=patient-1');
    expect(link.getAttribute('href')).toContain('treatmentId=treatment-1');
    expect(link.getAttribute('href')).toContain('recommendedDate=2026-09-12');
  });
});

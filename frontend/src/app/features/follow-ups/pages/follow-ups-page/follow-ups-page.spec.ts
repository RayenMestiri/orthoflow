import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionService } from '../../../../core/auth/permissions';
import { FollowUpsApiService } from '../../data-access/follow-ups-api.service';
import type { FollowUpResult } from '../../models/follow-up.models';
import { FollowUpsPage } from './follow-ups-page';

const RESULT: FollowUpResult = {
  summary: { needsScheduling: 1, overdue: 1, scheduled: 0 },
  rows: [
    {
      patient: { id: 'patient-1', fullName: 'Nadia Ben Ali', phone: '+216 20 000 000' },
      treatment: { id: 'treatment-1', label: 'Clear aligners', status: 'ACTIVE' },
      sourceVisit: {
        id: 'visit-1',
        startedAt: '2026-08-01T09:00:00.000Z',
        completedAt: '2026-08-01T09:30:00.000Z',
      },
      recommendedAt: '2026-08-10T12:00:00.000Z',
      appointment: null,
      state: 'OVERDUE',
      daysFromRecommendation: 5,
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, pages: 1 },
};

describe('FollowUpsPage', () => {
  let fixture: ComponentFixture<FollowUpsPage>;
  let api: { list: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    api = { list: vi.fn().mockReturnValue(of(RESULT)) };
    await TestBed.configureTestingModule({
      imports: [FollowUpsPage],
      providers: [
        provideRouter([]),
        { provide: FollowUpsApiService, useValue: api },
        { provide: PermissionService, useValue: { can: () => true } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FollowUpsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders derived state, summary and scheduler prefill identifiers', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Nadia Ben Ali');
    expect(element.textContent).toContain('5 days overdue');
    const scheduleLink = element.querySelector('a.button--primary') as HTMLAnchorElement;
    expect(scheduleLink.getAttribute('href')).toContain('patientId=patient-1');
    expect(scheduleLink.getAttribute('href')).toContain('treatmentId=treatment-1');
    expect(scheduleLink.getAttribute('href')).toContain('recommendedDate=2026-08-10');
  });

  it('sends state filters and search to the server', async () => {
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.tabs button')];
    (
      buttons.find((button) => button.textContent?.includes('Scheduled')) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ filter: 'SCHEDULED' }));
  });

  it('renders contextual retry when loading fails', async () => {
    api.list.mockReturnValue(
      throwError(() => ({ error: { error: { message: 'Network unavailable' } } })),
    );
    const component = fixture.componentInstance as unknown as { load: () => Promise<void> };
    await component.load();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Try again');
  });
});

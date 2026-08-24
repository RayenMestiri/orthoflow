import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionService } from '../../../../core/auth/permissions';
import { ClinicSettingsStore } from '../../../settings/data-access/clinic-settings.store';
import { CommunicationsApiService } from '../../data-access/communications-api.service';
import type { CommunicationJob } from '../../models/communication.models';
import { PatientCommunications } from './patient-communications';

function job(overrides: Partial<CommunicationJob> = {}): CommunicationJob {
  return {
    id: '652f1c9b8a1e4f0012ab0101',
    eventType: 'APPOINTMENT_SCHEDULED',
    patientId: '652f1c9b8a1e4f0012ab0001',
    appointmentId: '652f1c9b8a1e4f0012ab0002',
    recipientType: 'GUARDIAN',
    recipientId: '652f1c9b8a1e4f0012ab0003',
    channel: 'EMAIL',
    destinationMasked: 'sa***@example.com',
    templateKey: 'APPOINTMENT_REMINDER',
    status: 'FAILED',
    scheduledFor: '2026-08-24T08:00:00.000Z',
    sentAt: null,
    attemptCount: 2,
    lastErrorCode: 'PROVIDER_TEMPORARY_FAILURE',
    retryOfJobId: null,
    createdAt: '2026-08-23T08:00:00.000Z',
    ...overrides,
  };
}

describe('PatientCommunications', () => {
  let fixture: ComponentFixture<PatientCommunications>;
  let api: { listForPatient: ReturnType<typeof vi.fn>; retry: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { listForPatient: vi.fn(() => of([job()])), retry: vi.fn(() => of({ queued: true })) };
    TestBed.configureTestingModule({
      imports: [PatientCommunications],
      providers: [
        { provide: CommunicationsApiService, useValue: api },
        { provide: PermissionService, useValue: { can: vi.fn(() => true) } },
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

  afterEach(() => fixture?.destroy());

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(PatientCommunications);
    fixture.componentRef.setInput('patientId', '652f1c9b8a1e4f0012ab0001');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders a masked delivery trace and owner retry action', async () => {
    const element = await render();

    expect(element.textContent).toContain('Appointment Reminder');
    expect(element.textContent).toContain('sa***@example.com');
    expect(element.textContent).toContain('Provider Temporary Failure');
    expect(element.textContent).not.toContain('sarah@example.com');

    (element.querySelector('.delivery-item__action button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(api.retry).toHaveBeenCalledWith('652f1c9b8a1e4f0012ab0101');
  });

  it('renders an explicit loading failure with a retry action', async () => {
    api.listForPatient.mockReturnValue(throwError(() => new Error('offline')));
    const element = await render();

    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.textContent).toContain('Try again');
  });
});

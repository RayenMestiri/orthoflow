import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionService } from '../../../../core/auth/permissions';
import { FollowUpsApiService } from '../../../follow-ups/data-access/follow-ups-api.service';
import { ClinicSettingsStore } from '../../../settings/data-access/clinic-settings.store';
import { TreatmentsApiService } from '../../../treatments/data-access/treatments-api.service';
import { PatientsApiService } from '../../data-access/patients-api.service';
import type { Patient } from '../../models/patient.models';
import { PatientDetailPage } from './patient-detail-page';

const PATIENT: Patient = {
  id: 'patient-1',
  clinicId: 'clinic-1',
  firstName: 'Nadia',
  lastName: 'Ben Ali',
  fullName: 'Nadia Ben Ali',
  referenceNumber: 'PAT-0001',
  birthDate: '2012-04-12',
  age: 14,
  gender: 'FEMALE',
  phone: '+216 20 000 000',
  email: null,
  address: { line1: null, city: 'Tunis', postalCode: null, country: 'Tunisia' },
  status: 'ACTIVE',
  notes: null,
  createdBy: 'user-1',
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-08-15T09:00:00.000Z',
  archivedAt: null,
  primaryGuardian: null,
};

describe('PatientDetailPage activity integration', () => {
  let fixture: ComponentFixture<PatientDetailPage>;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      get: vi.fn(() => of(PATIENT)),
      listGuardians: vi.fn(() => of([])),
      activity: vi.fn(() => of({ items: [], total: 0, page: 1, limit: 20, pages: 0 })),
    };
    TestBed.configureTestingModule({
      imports: [PatientDetailPage],
      providers: [
        provideRouter([]),
        { provide: PatientsApiService, useValue: api },
        { provide: PermissionService, useValue: { can: () => false } },
        { provide: TreatmentsApiService, useValue: { listForPatient: vi.fn(() => of([])) } },
        { provide: FollowUpsApiService, useValue: { list: vi.fn(() => of({ rows: [] })) } },
        {
          provide: ClinicSettingsStore,
          useValue: {
            settings: signal({ general: { timezone: 'Africa/Tunis' } }),
            load: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: (key: string) => (key === 'patientId' ? PATIENT.id : null) },
              queryParamMap: { get: () => null },
            },
          },
        },
      ],
    });
  });

  it('does not load the timeline until the Activity tab mounts', async () => {
    fixture = TestBed.createComponent(PatientDetailPage);
    await fixture.componentInstance.load();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api['activity']).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toBeNull();
    expect(fixture.componentInstance.patient()?.id).toBe(PATIENT.id);
    fixture.componentInstance.activeView.set('activity');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(api['activity']).toHaveBeenCalledWith(PATIENT.id, 1, 20, 'ALL');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-patient-activity'),
    ).not.toBeNull();
  });
});

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
      getGuardianChildren: vi.fn(() => of([])),
      makePrimaryGuardian: vi.fn(),
      unlinkGuardian: vi.fn(),
      searchGuardians: vi.fn(() => of([])),
      linkExistingGuardian: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [PatientDetailPage],
      providers: [
        provideRouter([]),
        { provide: PatientsApiService, useValue: api },
        { provide: PermissionService, useValue: { can: () => true } },
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

  it('identifies minor patient and renders minor warning when no guardian is linked', async () => {
    fixture = TestBed.createComponent(PatientDetailPage);
    await fixture.componentInstance.load();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.isMinor()).toBe(true);
    expect(fixture.componentInstance.guardians().length).toBe(0);
    const native = fixture.nativeElement as HTMLElement;
    expect(native.querySelector('.guardian-minor-notice')).not.toBeNull();
  });

  it('opens guardian view-first drawer and loads sibling children', async () => {
    const mockGuardian = {
      id: 'g-1',
      firstName: 'Mohamed',
      lastName: 'Mestiri',
      fullName: 'Mohamed Mestiri',
      relationship: 'FATHER' as const,
      phone: '+216 20 111 222',
      email: 'mohamed@test.com',
      isPrimary: false,
      financiallyResponsible: true,
      contactPreference: 'PHONE' as const,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    api['listGuardians'] = vi.fn(() => of([mockGuardian]));
    api['getGuardianChildren'] = vi.fn(() =>
      of([
        {
          patientId: 'patient-2',
          firstName: 'Youssef',
          lastName: 'Ben Ali',
          fullName: 'Youssef Ben Ali',
          relationship: 'FATHER' as const,
          referenceNumber: 'PAT-0002',
          birthDate: '2015-05-10',
          isPrimary: true,
        },
      ]),
    );

    fixture = TestBed.createComponent(PatientDetailPage);
    await fixture.componentInstance.load();
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.openGuardianView(mockGuardian);
    fixture.detectChanges();

    expect(fixture.componentInstance.guardianPanelOpen()).toBe(true);
    expect(fixture.componentInstance.guardianDrawerView()).toBe('VIEW');
    expect(fixture.componentInstance.viewingGuardian()?.fullName).toBe('Mohamed Mestiri');
    expect(api['getGuardianChildren']).toHaveBeenCalledWith('patient-1', 'g-1');
  });

  it('promotes guardian to primary contact and unsets previous', async () => {
    const g1 = {
      id: 'g-1',
      firstName: 'Mohamed',
      lastName: 'Mestiri',
      fullName: 'Mohamed Mestiri',
      relationship: 'FATHER' as const,
      phone: null,
      email: null,
      isPrimary: true,
      financiallyResponsible: true,
      contactPreference: 'PHONE' as const,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const g2 = {
      id: 'g-2',
      firstName: 'Leila',
      lastName: 'Mestiri',
      fullName: 'Leila Mestiri',
      relationship: 'MOTHER' as const,
      phone: null,
      email: null,
      isPrimary: false,
      financiallyResponsible: false,
      contactPreference: 'PHONE' as const,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    api['listGuardians'] = vi.fn(() => of([g1, g2]));
    api['makePrimaryGuardian'] = vi.fn(() => of({ ...g2, isPrimary: true }));

    fixture = TestBed.createComponent(PatientDetailPage);
    await fixture.componentInstance.load();
    fixture.detectChanges();

    await fixture.componentInstance.makePrimary(g2);
    expect(api['makePrimaryGuardian']).toHaveBeenCalledWith('patient-1', 'g-2');
    expect(fixture.componentInstance.guardians().find((g) => g.id === 'g-2')?.isPrimary).toBe(true);
    expect(fixture.componentInstance.guardians().find((g) => g.id === 'g-1')?.isPrimary).toBe(false);
  });

  it('unlinks guardian from patient and updates list', async () => {
    const g1 = {
      id: 'g-1',
      firstName: 'Mohamed',
      lastName: 'Mestiri',
      fullName: 'Mohamed Mestiri',
      relationship: 'FATHER' as const,
      phone: null,
      email: null,
      isPrimary: true,
      financiallyResponsible: true,
      contactPreference: 'PHONE' as const,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    api['listGuardians'] = vi.fn(() => of([g1]));
    api['unlinkGuardian'] = vi.fn(() => of({ unlinked: true }));

    fixture = TestBed.createComponent(PatientDetailPage);
    await fixture.componentInstance.load();
    fixture.detectChanges();

    fixture.componentInstance.promptUnlinkGuardian(g1);
    expect(fixture.componentInstance.unlinkConfirmOpen()).toBe(true);

    await fixture.componentInstance.confirmUnlink();
    expect(api['unlinkGuardian']).toHaveBeenCalledWith('patient-1', 'g-1');
    expect(fixture.componentInstance.guardians().length).toBe(0);
    expect(fixture.componentInstance.unlinkConfirmOpen()).toBe(false);
  });
});

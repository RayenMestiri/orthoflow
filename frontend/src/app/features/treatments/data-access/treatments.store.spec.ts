import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Treatment, TreatmentWithMilestones } from '../models/treatment.models';
import { TreatmentsApiService } from './treatments-api.service';
import { TreatmentsStore } from './treatments.store';

function apiError(code: string, message: string, status = 400): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { success: false, error: { code, message } } });
}

function treatment(overrides: Partial<TreatmentWithMilestones> = {}): TreatmentWithMilestones {
  return {
    id: 'treatment-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    type: 'METAL_BRACES',
    customTypeLabel: null,
    status: 'ACTIVE',
    startDate: '2026-01-05',
    expectedEndDate: '2027-01-05',
    completedAt: null,
    agreedPrice: 3200,
    notes: null,
    cancellationReason: null,
    durationDays: 120,
    isCurrent: true,
    createdBy: 'doctor-1',
    updatedBy: null,
    createdAt: '2026-01-05T09:00:00.000Z',
    updatedAt: '2026-01-05T09:00:00.000Z',
    milestones: [],
    ...overrides,
  };
}

describe('TreatmentsStore', () => {
  let store: TreatmentsStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      listForPatient: vi.fn(() => of([treatment()])),
      create: vi.fn(() => of(treatment() as Treatment)),
      update: vi.fn(() => of(treatment() as Treatment)),
      start: vi.fn(() => of(treatment() as Treatment)),
      pause: vi.fn(() => of(treatment() as Treatment)),
      resume: vi.fn(() => of(treatment() as Treatment)),
      complete: vi.fn(() => of(treatment() as Treatment)),
      cancel: vi.fn(() => of(treatment() as Treatment)),
      addMilestone: vi.fn(() => of({})),
      updateMilestone: vi.fn(() => of({})),
    };
    TestBed.configureTestingModule({
      providers: [TreatmentsStore, { provide: TreatmentsApiService, useValue: api }],
    });
    store = TestBed.inject(TreatmentsStore);
  });

  it('loads one patient history once', async () => {
    await store.load('patient-1');
    await store.load('patient-1');
    expect(api['listForPatient']).toHaveBeenCalledTimes(1);
    expect(store.treatments()).toHaveLength(1);
  });

  it('drops stale state when the patient changes', async () => {
    await store.load('patient-1');
    api['listForPatient']?.mockReturnValueOnce(of([]));
    await store.load('patient-2');
    expect(store.treatments()).toEqual([]);
  });

  it('prioritizes ACTIVE over PAUSED and keeps other paused care visible', async () => {
    api['listForPatient']?.mockReturnValueOnce(
      of([
        treatment({ id: 'paused', status: 'PAUSED', isCurrent: false }),
        treatment({ id: 'active', status: 'ACTIVE' }),
      ]),
    );
    await store.load('patient-1');
    expect(store.featuredTreatment()?.id).toBe('active');
    expect(store.pausedTreatments().map((item) => item.id)).toEqual(['paused']);
  });

  it('splits planned and historical treatments', async () => {
    api['listForPatient']?.mockReturnValueOnce(
      of([
        treatment({ id: 'planned', status: 'PLANNED', isCurrent: false }),
        treatment({ id: 'completed', status: 'COMPLETED', isCurrent: false }),
        treatment({ id: 'cancelled', status: 'CANCELLED', isCurrent: false }),
      ]),
    );
    await store.load('patient-1');
    expect(store.plannedTreatments().map((item) => item.id)).toEqual(['planned']);
    expect(store.pastTreatments().map((item) => item.id)).toEqual(['completed', 'cancelled']);
  });

  it('reloads persisted milestones after a successful write', async () => {
    await store.load('patient-1');
    const saved = await store.addMilestone('treatment-1', {
      type: 'CONTROL',
      title: 'Monthly control',
    });
    expect(saved).toBe(true);
    expect(api['addMilestone']).toHaveBeenCalled();
    expect(api['listForPatient']).toHaveBeenCalledTimes(2);
  });

  it('surfaces the authoritative active-treatment conflict', async () => {
    await store.load('patient-1');
    api['start']?.mockReturnValueOnce(
      throwError(() =>
        apiError('TREATMENT_ALREADY_ACTIVE', 'Patient already has active care', 409),
      ),
    );
    expect(await store.start('planned')).toBe(false);
    expect(store.error()).toBe('Patient already has active care');
    expect(api['listForPatient']).toHaveBeenCalledTimes(1);
  });

  it('does not mutate before a patient is loaded', async () => {
    expect(await store.create({ type: 'RETAINER' })).toBe(false);
    expect(api['create']).not.toHaveBeenCalled();
  });

  it('clears dismissed errors', async () => {
    api['listForPatient']?.mockReturnValueOnce(
      throwError(() => apiError('PATIENT_NOT_FOUND', 'Patient not found', 404)),
    );
    await store.load('patient-1');
    store.dismissError();
    expect(store.error()).toBeNull();
  });
});

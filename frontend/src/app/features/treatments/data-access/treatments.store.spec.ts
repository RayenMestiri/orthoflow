import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Treatment, TreatmentWithProgress } from '../models/treatment.models';
import { TreatmentsApiService } from './treatments-api.service';
import { TreatmentsStore } from './treatments.store';

/** The store reads problems through `getApiProblem`, which needs a real response. */
function apiError(code: string, message: string, status = 400): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { success: false, error: { code, message } } });
}

function buildTreatment(overrides: Partial<TreatmentWithProgress> = {}): TreatmentWithProgress {
  return {
    id: 'treatment-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    treatmentType: 'Fixed braces',
    status: 'ACTIVE',
    startDate: '2026-01-05',
    expectedEndDate: '2027-01-05',
    actualEndDate: null,
    notes: null,
    totalPlannedCost: 3200,
    cancellationReason: null,
    durationDays: 120,
    isCurrent: true,
    createdBy: 'doctor-1',
    updatedBy: null,
    createdAt: '2026-01-05T09:00:00.000Z',
    updatedAt: '2026-01-05T09:00:00.000Z',
    progress: [],
    ...overrides,
  };
}

describe('TreatmentsStore', () => {
  let store: TreatmentsStore;
  let api: {
    listForPatient: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    complete: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    addProgress: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      listForPatient: vi.fn(() => of([buildTreatment()])),
      create: vi.fn(() => of(buildTreatment() as Treatment)),
      update: vi.fn(() => of(buildTreatment() as Treatment)),
      start: vi.fn(() => of(buildTreatment() as Treatment)),
      pause: vi.fn(() => of(buildTreatment() as Treatment)),
      resume: vi.fn(() => of(buildTreatment() as Treatment)),
      complete: vi.fn(() => of(buildTreatment() as Treatment)),
      cancel: vi.fn(() => of(buildTreatment() as Treatment)),
      addProgress: vi.fn(() => of({} as never)),
    };

    TestBed.configureTestingModule({
      providers: [TreatmentsStore, { provide: TreatmentsApiService, useValue: api }],
    });
    store = TestBed.inject(TreatmentsStore);
  });

  it('loads a patient history once and serves it from memory afterwards', async () => {
    await store.load('patient-1');
    await store.load('patient-1');

    expect(api.listForPatient).toHaveBeenCalledTimes(1);
    expect(store.treatments()).toHaveLength(1);
    expect(store.isLoaded()).toBe(true);
  });

  it('refetches when asked to force a reload', async () => {
    await store.load('patient-1');
    await store.load('patient-1', true);

    expect(api.listForPatient).toHaveBeenCalledTimes(2);
  });

  it('drops the previous patient file when the id changes', async () => {
    await store.load('patient-1');
    api.listForPatient.mockReturnValueOnce(of([]));

    await store.load('patient-2');

    expect(api.listForPatient).toHaveBeenLastCalledWith('patient-2');
    expect(store.treatments()).toEqual([]);
  });

  it('surfaces the server message when the history cannot be read', async () => {
    api.listForPatient.mockReturnValueOnce(
      throwError(() => apiError('PATIENT_NOT_FOUND', 'Patient not found', 404)),
    );

    await store.load('patient-1');

    expect(store.error()).toBe('Patient not found');
    expect(store.isLoaded()).toBe(false);
  });

  it('splits the history into current, planned and past', async () => {
    api.listForPatient.mockReturnValueOnce(
      of([
        buildTreatment({ id: 'a', status: 'PAUSED', isCurrent: true }),
        buildTreatment({ id: 'b', status: 'PLANNED', isCurrent: false }),
        buildTreatment({ id: 'c', status: 'COMPLETED', isCurrent: false }),
        buildTreatment({ id: 'd', status: 'CANCELLED', isCurrent: false }),
      ]),
    );

    await store.load('patient-1');

    // A paused course still occupies the patient's single care slot.
    expect(store.currentTreatment()?.id).toBe('a');
    expect(store.plannedTreatments().map((item) => item.id)).toEqual(['b']);
    expect(store.pastTreatments().map((item) => item.id)).toEqual(['c', 'd']);
  });

  it('reloads the history after a successful write', async () => {
    await store.load('patient-1');

    const saved = await store.create({ treatmentType: 'Clear aligners' });

    expect(saved).toBe(true);
    expect(api.create).toHaveBeenCalledWith('patient-1', { treatmentType: 'Clear aligners' });
    // Once for the initial load, once to pick up the server-written timeline entry.
    expect(api.listForPatient).toHaveBeenCalledTimes(2);
  });

  it('reports the one-active-treatment conflict without reloading', async () => {
    await store.load('patient-1');
    api.start.mockReturnValueOnce(
      throwError(() =>
        apiError('TREATMENT_ALREADY_ACTIVE', 'This patient already has a treatment in progress', 409),
      ),
    );

    const saved = await store.start('treatment-2');

    expect(saved).toBe(false);
    expect(store.error()).toBe('This patient already has a treatment in progress');
    expect(api.listForPatient).toHaveBeenCalledTimes(1);
  });

  it('refuses to mutate before a patient has been loaded', async () => {
    const saved = await store.create({ treatmentType: 'Retainer' });

    expect(saved).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
  });

  it('clears a dismissed error', async () => {
    api.listForPatient.mockReturnValueOnce(
      throwError(() => apiError('TREATMENT_NOT_FOUND', 'Treatment not found', 404)),
    );
    await store.load('patient-1');

    store.dismissError();

    expect(store.error()).toBeNull();
  });
});

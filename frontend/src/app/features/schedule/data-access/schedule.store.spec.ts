import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../core/auth/auth.store';
import type { Appointment, AppointmentType } from '../models/schedule.models';
import { ScheduleApiService } from './schedule-api.service';
import { ScheduleStore } from './schedule.store';

function buildAppointment(overrides: Partial<Appointment> = {}): Appointment {
  const start = overrides.startAt ?? new Date().toISOString();
  return {
    id: 'appointment-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    appointmentTypeId: 'type-1',
    startAt: start,
    endAt: new Date(new Date(start).getTime() + 15 * 60_000).toISOString(),
    durationMinutes: 15,
    status: 'SCHEDULED',
    note: null,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    arrivedAt: null,
    treatmentStartedAt: null,
    completedAt: null,
    noShowAt: null,
    markedNoShowBy: null,
    overbookingOverride: false,
    overbookingApprovedBy: null,
    createdBy: 'doctor-1',
    updatedBy: null,
    createdAt: start,
    updatedAt: start,
    patient: { id: 'patient-1', fullName: 'Yasmine Trabelsi', phone: null, age: 12 },
    appointmentType: { id: 'type-1', name: 'Monthly control', color: null, durationMinutes: 15 },
    slotCapacity: {
      state: 'AVAILABLE',
      concurrentAppointments: 1,
      recommendedCapacity: 2,
      overbookingOverride: false,
    },
    ...overrides,
  };
}

const monthlyControl: AppointmentType = {
  id: 'type-1',
  clinicId: 'clinic-1',
  name: 'Monthly control',
  durationMinutes: 15,
  color: null,
  description: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const clinicSchedule = {
  timezone: 'Africa/Tunis',
  workingHours: {
    monday: [
      { start: '08:00', end: '12:00' },
      { start: '14:00', end: '18:00' },
    ],
    tuesday: [{ start: '08:00', end: '18:00' }],
    wednesday: [{ start: '08:00', end: '18:00' }],
    thursday: [{ start: '08:00', end: '18:00' }],
    friday: [{ start: '08:00', end: '18:00' }],
    saturday: [{ start: '08:00', end: '13:00' }],
    sunday: [],
  },
  scheduling: {
    slotIntervalMinutes: 20,
    defaultAppointmentDurationMinutes: 40,
    defaultConcurrentCapacity: 2,
    allowOwnerOverbooking: false,
  },
};

describe('ScheduleStore', () => {
  let store: ScheduleStore;
  let api: {
    listAppointments: ReturnType<typeof vi.fn>;
    createAppointment: ReturnType<typeof vi.fn>;
    updateAppointment: ReturnType<typeof vi.fn>;
    changeStatus: ReturnType<typeof vi.fn>;
    cancelAppointment: ReturnType<typeof vi.fn>;
    listAppointmentTypes: ReturnType<typeof vi.fn>;
    getClinicSchedule: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      listAppointments: vi.fn(() => of([buildAppointment()])),
      createAppointment: vi.fn((input) => of(buildAppointment({ id: 'created', ...input }))),
      updateAppointment: vi.fn(() => of(buildAppointment({ id: 'appointment-1' }))),
      changeStatus: vi.fn((_id, status) => of(buildAppointment({ status }))),
      cancelAppointment: vi.fn(() =>
        of(buildAppointment({ status: 'CANCELLED', cancellationReason: 'Family emergency' })),
      ),
      listAppointmentTypes: vi.fn(() => of([monthlyControl])),
      getClinicSchedule: vi.fn(() => of(clinicSchedule)),
    };

    TestBed.configureTestingModule({
      providers: [
        ScheduleStore,
        { provide: ScheduleApiService, useValue: api },
        { provide: AuthStore, useValue: { activeClinicId: () => 'clinic-1' } },
      ],
    });
    store = TestBed.inject(ScheduleStore);
  });

  it('fetches only the visible range and keeps it on refresh', async () => {
    await store.rangeChanged({
      start: '2026-08-10T00:00:00.000Z',
      end: '2026-08-17T00:00:00.000Z',
      title: 'Aug 10 – 16',
    });

    expect(api.listAppointments).toHaveBeenCalledWith(
      '2026-08-10T00:00:00.000Z',
      '2026-08-17T00:00:00.000Z',
    );
    expect(store.appointments()).toHaveLength(1);

    // Same range again (e.g. FullCalendar re-emitting) → no duplicate request.
    await store.rangeChanged({
      start: '2026-08-10T00:00:00.000Z',
      end: '2026-08-17T00:00:00.000Z',
      title: 'Aug 10 – 16',
    });
    expect(api.listAppointments).toHaveBeenCalledTimes(1);
  });

  it('opens the create drawer with the picked slot and closes after creating', async () => {
    store.openCreate({ startAt: '2026-08-10T08:00:00.000Z', endAt: null });
    expect(store.drawerMode()).toBe('create');
    expect(store.draftSlot()?.startAt).toBe('2026-08-10T08:00:00.000Z');

    const created = await store.createAppointment({
      patientId: 'patient-1',
      appointmentTypeId: 'type-1',
      startAt: '2026-08-10T08:00:00.000Z',
    });

    expect(created).toBe(true);
    expect(store.drawerMode()).toBeNull();
    expect(store.appointments().some((a) => a.id === 'created')).toBe(true);
  });

  it('opens the edit drawer for a loaded appointment', async () => {
    await store.rangeChanged({ start: 'a', end: 'b', title: '' });
    store.openEdit('appointment-1');

    expect(store.drawerMode()).toBe('edit');
    expect(store.selectedAppointment()?.id).toBe('appointment-1');
  });

  it('reports reschedule success so the calendar keeps the moved event', async () => {
    await store.rangeChanged({ start: 'a', end: 'b', title: '' });

    const persisted = await store.reschedule(
      'appointment-1',
      '2026-08-10T09:00:00.000Z',
      '2026-08-10T09:30:00.000Z',
    );

    expect(persisted).toBe(true);
    expect(api.updateAppointment).toHaveBeenCalledWith('appointment-1', {
      startAt: '2026-08-10T09:00:00.000Z',
      durationMinutes: 30,
    });
  });

  it('reports reschedule failure so the calendar can revert, and surfaces the error', async () => {
    api.updateAppointment.mockReturnValue(
      throwError(() => ({
        error: {
          success: false,
          error: { code: 'APPOINTMENT_TIME_CONFLICT', message: 'The doctor already has…' },
        },
      })),
    );

    const persisted = await store.reschedule('appointment-1', 'x', 'x');

    expect(persisted).toBe(false);
    expect(store.error()).toBeTruthy();
  });

  it('updates status in place so the calendar re-renders immediately', async () => {
    await store.rangeChanged({ start: 'a', end: 'b', title: '' });
    store.openEdit('appointment-1');

    await store.changeStatus('appointment-1', 'CONFIRMED');

    expect(store.appointments()[0]?.status).toBe('CONFIRMED');
    expect(store.selectedAppointment()?.status).toBe('CONFIRMED');
  });

  it('keeps a cancelled appointment in state with its reason', async () => {
    await store.rangeChanged({ start: 'a', end: 'b', title: '' });
    store.openEdit('appointment-1');

    await store.cancelAppointment('appointment-1', 'Family emergency');

    expect(store.appointments()[0]?.status).toBe('CANCELLED');
    expect(store.appointments()[0]?.cancellationReason).toBe('Family emergency');
    expect(store.drawerMode()).toBeNull();
  });

  it('loads appointment types once per clinic', async () => {
    await store.initialize();
    await store.initialize();

    expect(api.listAppointmentTypes).toHaveBeenCalledTimes(1);
    expect(store.activeTypes()[0]?.name).toBe('Monthly control');
  });

  it('uses the persisted clinic configuration without a local fallback', async () => {
    await store.initialize();

    const schedule = store.clinicSchedule();
    expect(schedule?.scheduling.slotIntervalMinutes).toBe(20);
    expect(schedule?.workingHours.monday).toHaveLength(2);
    expect(schedule?.scheduling.allowOwnerOverbooking).toBe(false);
  });
});

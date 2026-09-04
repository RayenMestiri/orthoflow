import { describe, expect, it } from 'vitest';
import type { Appointment } from '../models/schedule.models';
import { computeCollisionGroups } from './collision-layout.utils';

function createMockAppointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: 'appt-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    treatmentId: null,
    doctorId: 'doc-1',
    appointmentTypeId: 'type-1',
    startAt: '2026-09-04T10:00:00.000Z',
    endAt: '2026-09-04T10:30:00.000Z',
    durationMinutes: 30,
    status: 'SCHEDULED',
    note: null,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    arrivedAt: null,
    waitingAt: null,
    treatmentStartedAt: null,
    completedAt: null,
    noShowAt: null,
    markedNoShowBy: null,
    overbookingOverride: false,
    overbookingApprovedBy: null,
    createdBy: 'user-1',
    updatedBy: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    patient: { id: 'patient-1', fullName: 'Ahmed Ben Ali', phone: null, age: null },
    treatment: null,
    appointmentType: { id: 'type-1', name: 'Consultation', color: '#173f38', durationMinutes: 30 },
    slotCapacity: { state: 'AVAILABLE', concurrentAppointments: 1, recommendedCapacity: 1, overbookingOverride: false },
    ...overrides,
  };
}

describe('computeCollisionGroups', () => {
  it('returns empty map for empty appointment list', () => {
    const map = computeCollisionGroups([]);
    expect(map.size).toBe(0);
  });

  it('handles 1 appointment as non-overlapping solo card', () => {
    const appt = createMockAppointment({ id: 'a1' });
    const map = computeCollisionGroups([appt]);

    expect(map.size).toBe(1);
    const meta = map.get('a1')!;
    expect(meta.isOverlapping).toBe(false);
    expect(meta.groupTotal).toBe(1);
    expect(meta.groupIndex).toBe(0);
    expect(meta.isExtremeDensity).toBe(false);
    expect(meta.hiddenInCompact).toBe(false);
  });

  it('treats adjacent appointments (09:00-09:30 and 09:30-10:00) as separate, non-overlapping', () => {
    const a1 = createMockAppointment({
      id: 'a1',
      startAt: '2026-09-04T09:00:00.000Z',
      endAt: '2026-09-04T09:30:00.000Z',
    });
    const a2 = createMockAppointment({
      id: 'a2',
      startAt: '2026-09-04T09:30:00.000Z',
      endAt: '2026-09-04T10:00:00.000Z',
    });

    const map = computeCollisionGroups([a1, a2]);
    expect(map.get('a1')!.isOverlapping).toBe(false);
    expect(map.get('a2')!.isOverlapping).toBe(false);
    expect(map.get('a1')!.groupId).not.toBe(map.get('a2')!.groupId);
  });

  it('correctly groups 2 overlapping appointments at the same time', () => {
    const a1 = createMockAppointment({
      id: 'a1',
      startAt: '2026-09-04T10:00:00.000Z',
      endAt: '2026-09-04T10:30:00.000Z',
      patient: { id: 'p1', fullName: 'Ahmed Ben Ali', phone: null, age: null },
    });
    const a2 = createMockAppointment({
      id: 'a2',
      startAt: '2026-09-04T10:00:00.000Z',
      endAt: '2026-09-04T10:30:00.000Z',
      patient: { id: 'p2', fullName: 'Sara Trabelsi', phone: null, age: null },
    });

    const map = computeCollisionGroups([a1, a2]);
    expect(map.size).toBe(2);

    const m1 = map.get('a1')!;
    const m2 = map.get('a2')!;

    expect(m1.isOverlapping).toBe(true);
    expect(m2.isOverlapping).toBe(true);
    expect(m1.groupId).toBe(m2.groupId);
    expect(m1.groupTotal).toBe(2);
    expect(m2.groupTotal).toBe(2);
    expect(m1.groupIndex).toBe(0);
    expect(m2.groupIndex).toBe(1);
  });

  it('correctly groups 3 overlapping appointments (Ahmed, Sara, Mohamed)', () => {
    const a1 = createMockAppointment({
      id: 'a1',
      startAt: '2026-09-04T10:00:00.000Z',
      endAt: '2026-09-04T10:30:00.000Z',
      patient: { id: 'p1', fullName: 'Ahmed Ben Ali', phone: null, age: null },
    });
    const a2 = createMockAppointment({
      id: 'a2',
      startAt: '2026-09-04T10:00:00.000Z',
      endAt: '2026-09-04T10:30:00.000Z',
      patient: { id: 'p2', fullName: 'Sara Trabelsi', phone: null, age: null },
    });
    const a3 = createMockAppointment({
      id: 'a3',
      startAt: '2026-09-04T10:00:00.000Z',
      endAt: '2026-09-04T10:30:00.000Z',
      patient: { id: 'p3', fullName: 'Mohamed Salah', phone: null, age: null },
    });

    const map = computeCollisionGroups([a1, a2, a3]);
    expect(map.size).toBe(3);

    const m1 = map.get('a1')!;
    const m2 = map.get('a2')!;
    const m3 = map.get('a3')!;

    expect(m1.groupId).toBe(m2.groupId);
    expect(m2.groupId).toBe(m3.groupId);
    expect(m1.groupTotal).toBe(3);
    expect(m1.groupIndex).toBe(0);
    expect(m2.groupIndex).toBe(1);
    expect(m3.groupIndex).toBe(2);
    expect(m1.isExtremeDensity).toBe(false);
  });

  it('connects staggered overlapping intervals into single collision group (09:00-09:30, 09:15-10:00, 09:20-09:50)', () => {
    const a1 = createMockAppointment({
      id: 'a1',
      startAt: '2026-09-04T09:00:00.000Z',
      endAt: '2026-09-04T09:30:00.000Z',
    });
    const a2 = createMockAppointment({
      id: 'a2',
      startAt: '2026-09-04T09:15:00.000Z',
      endAt: '2026-09-04T10:00:00.000Z',
    });
    const a3 = createMockAppointment({
      id: 'a3',
      startAt: '2026-09-04T09:20:00.000Z',
      endAt: '2026-09-04T09:50:00.000Z',
    });

    const map = computeCollisionGroups([a1, a2, a3]);
    expect(map.get('a1')!.groupId).toBe(map.get('a2')!.groupId);
    expect(map.get('a2')!.groupId).toBe(map.get('a3')!.groupId);
    expect(map.get('a1')!.groupTotal).toBe(3);
  });

  it('ignores CANCELLED appointments', () => {
    const a1 = createMockAppointment({
      id: 'a1',
      status: 'CANCELLED',
      startAt: '2026-09-04T10:00:00.000Z',
      endAt: '2026-09-04T10:30:00.000Z',
    });
    const a2 = createMockAppointment({
      id: 'a2',
      status: 'SCHEDULED',
      startAt: '2026-09-04T10:00:00.000Z',
      endAt: '2026-09-04T10:30:00.000Z',
    });

    const map = computeCollisionGroups([a1, a2]);
    expect(map.has('a1')).toBe(false);
    expect(map.get('a2')!.isOverlapping).toBe(false);
    expect(map.get('a2')!.groupTotal).toBe(1);
  });

  it('handles extreme density (5+ appointments) with hiddenInCompact flags', () => {
    const appts = [1, 2, 3, 4, 5, 6].map((i) =>
      createMockAppointment({
        id: `a${i}`,
        startAt: '2026-09-04T11:00:00.000Z',
        endAt: '2026-09-04T11:30:00.000Z',
      })
    );

    const map = computeCollisionGroups(appts);
    expect(map.size).toBe(6);

    const m1 = map.get('a1')!;
    const m3 = map.get('a3')!;
    const m4 = map.get('a4')!;
    const m6 = map.get('a6')!;

    expect(m1.isExtremeDensity).toBe(true);
    expect(m1.groupTotal).toBe(6);
    expect(m1.hiddenInCompact).toBe(false); // index 0
    expect(m3.hiddenInCompact).toBe(false); // index 2
    expect(m4.hiddenInCompact).toBe(false); // all appointments remain visible on grid
    expect(m6.hiddenInCompact).toBe(false); // all appointments remain visible on grid
  });
});

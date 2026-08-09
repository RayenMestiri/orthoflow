import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionService, PERMISSIONS, type Permission } from '../../../../core/auth/permissions';
import { ReceptionApiService } from '../../data-access/reception.api';
import type {
  AppointmentActivity,
  ReceptionBoard,
  ReceptionRow,
} from '../../models/reception.models';
import { TodayPage } from './today-page';

function row(overrides: Partial<ReceptionRow> = {}): ReceptionRow {
  return {
    appointmentId: 'appt-1',
    patientId: 'patient-1',
    patientName: 'Ahmed Ben Salah',
    appointmentTypeName: 'Monthly control',
    treatmentLabel: 'Metal braces',
    startAt: '2026-08-09T09:00:00.000Z',
    endAt: '2026-08-09T09:15:00.000Z',
    durationMinutes: 15,
    status: 'WAITING',
    flowGroup: 'WAITING',
    lateByMinutes: null,
    arrivedAt: '2026-08-09T08:55:00.000Z',
    waitingSince: '2026-08-09T08:56:00.000Z',
    treatmentStartedAt: null,
    completedAt: null,
    noShowAt: null,
    note: null,
    cancellationReason: null,
    ...overrides,
  };
}

function board(rows: ReceptionRow[]): ReceptionBoard {
  return {
    date: '2026-08-09',
    timezone: 'Africa/Tunis',
    generatedAt: '2026-08-09T09:00:00.000Z',
    summary: {
      total: rows.length,
      completed: 0,
      waiting: rows.length,
      inTreatment: 0,
      late: 0,
      upcoming: 0,
      noShow: 0,
      cancelled: 0,
    },
    rows,
  };
}

function activity(overrides: Partial<AppointmentActivity> = {}): AppointmentActivity {
  return {
    id: 'audit-1',
    action: 'appointment.status_changed',
    actorName: 'Sarah Trabelsi',
    actorRole: 'SECRETARY',
    metadata: { from: 'SCHEDULED', to: 'ARRIVED' },
    createdAt: '2026-08-09T08:55:00.000Z',
    ...overrides,
  };
}

/** Everything except the two clinical transitions — i.e. the front desk. */
const DESK_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS).filter(
  (permission) =>
    permission !== PERMISSIONS.APPOINTMENTS_START_VISIT &&
    permission !== PERMISSIONS.APPOINTMENTS_COMPLETE_VISIT,
);

describe('TodayPage', () => {
  let fixture: ComponentFixture<TodayPage>;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let granted: readonly Permission[];

  async function render(rows: ReceptionRow[]): Promise<HTMLElement> {
    api['today']?.mockReturnValue(of(board(rows)));
    fixture = TestBed.createComponent(TodayPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  async function openDrawer(element: HTMLElement): Promise<void> {
    (element.querySelector('.flow-row') as HTMLElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    granted = Object.values(PERMISSIONS);
    api = {
      today: vi.fn(() => of(board([row()]))),
      changeStatus: vi.fn(() => of({})),
      cancel: vi.fn(() => of({})),
      activity: vi.fn(() => of([activity()])),
    };
    TestBed.configureTestingModule({
      imports: [TodayPage],
      providers: [
        { provide: ReceptionApiService, useValue: api },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: PermissionService,
          useValue: { can: (permission: Permission) => granted.includes(permission) },
        },
      ],
    });
  });

  describe('who may run the chair', () => {
    it('offers Start visit to clinical staff', async () => {
      const element = await render([row()]);

      expect(element.textContent).toContain('Start visit');
    });

    it('offers Complete visit to clinical staff', async () => {
      const element = await render([
        row({ status: 'IN_TREATMENT', flowGroup: 'IN_TREATMENT', treatmentStartedAt: '2026-08-09T09:01:00.000Z' }),
      ]);

      expect(element.textContent).toContain('Complete visit');
    });

    it('hides Start visit from the front desk rather than disabling it', async () => {
      granted = DESK_PERMISSIONS;

      const element = await render([row()]);

      // Absent, not greyed: a disabled button reads as broken software.
      expect(element.textContent).not.toContain('Start visit');
      expect(element.querySelector('.flow-btn[disabled]')).toBeNull();
    });

    it('hides Complete visit from the front desk', async () => {
      granted = DESK_PERMISSIONS;

      const element = await render([
        row({ status: 'IN_TREATMENT', flowGroup: 'IN_TREATMENT' }),
      ]);

      expect(element.textContent).not.toContain('Complete visit');
    });

    it('still offers the front desk the arrival step', async () => {
      granted = DESK_PERMISSIONS;

      const element = await render([row({ status: 'SCHEDULED', flowGroup: 'UPCOMING' })]);

      expect(element.textContent).toContain('Patient arrived');
    });
  });

  describe('activity timeline', () => {
    it('names the actor and role for each recorded action', async () => {
      const element = await render([row()]);

      await openDrawer(element);

      const timeline = element.querySelector('.flow-timeline') as HTMLElement;
      expect(api['activity']).toHaveBeenCalledWith('appt-1');
      expect(timeline.textContent).toContain('Patient arrived');
      expect(timeline.textContent).toContain('Sarah Trabelsi · Secretary');
    });

    it('shows the actor without a role when the person has left the clinic', async () => {
      api['activity']?.mockReturnValue(of([activity({ actorRole: null })]));
      const element = await render([row()]);

      await openDrawer(element);

      const timeline = element.querySelector('.flow-timeline') as HTMLElement;
      expect(timeline.textContent).toContain('Sarah Trabelsi');
      expect(timeline.textContent).not.toContain('·');
    });

    it('says so when the history cannot be read, instead of inventing one', async () => {
      api['activity']?.mockReturnValue(throwError(() => new Error('offline')));
      const element = await render([row()]);

      await openDrawer(element);

      const timeline = element.querySelector('.flow-timeline') as HTMLElement;
      expect(timeline.textContent).toContain("Activity history couldn't be loaded.");
      // No fabricated entries stood in for the missing log.
      expect(timeline.querySelectorAll('ol li')).toHaveLength(0);
      // And the board itself is still usable.
      expect(element.querySelectorAll('.flow-row')).toHaveLength(1);
    });

    it('shows the cancellation reason on a cancelled appointment', async () => {
      const element = await render([
        row({
          status: 'CANCELLED',
          flowGroup: 'CLOSED',
          cancellationReason: 'Patient called to postpone',
        }),
      ]);

      await openDrawer(element);

      expect(element.querySelector('.flow-note--cancelled')?.textContent).toContain(
        'Patient called to postpone',
      );
    });
  });
});

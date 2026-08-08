import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  OnInit,
  viewChild,
} from '@angular/core';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { AppointmentDrawer } from '../../components/appointment-drawer/appointment-drawer';
import {
  ScheduleCalendar,
  type RescheduleRequest,
  type SlotSelection,
} from '../../components/schedule-calendar/schedule-calendar';
import { ScheduleToolbar } from '../../components/schedule-toolbar/schedule-toolbar';
import { ScheduleStore } from '../../data-access/schedule.store';
import type { Appointment, CalendarViewName } from '../../models/schedule.models';
import { formatLongDate, formatTime } from '../../utils/appointment-time.utils';

/**
 * The scheduling workspace. Pure composition: the store owns state, the
 * calendar renders it, the drawer edits it — this page just wires them.
 */
@Component({
  selector: 'app-schedule-page',
  imports: [ScheduleToolbar, ScheduleCalendar, AppointmentDrawer],
  templateUrl: './schedule-page.html',
  styleUrl: './schedule-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePage implements OnInit {
  protected readonly store = inject(ScheduleStore);
  private readonly permissions = inject(PermissionService);

  protected readonly calendar = viewChild(ScheduleCalendar);

  /** Secretaries and practitioners manage the diary; assistants read it. */
  protected readonly canEdit = computed(
    () =>
      this.permissions.can(PERMISSIONS.PATIENTS_CREATE) &&
      this.permissions.can(PERMISSIONS.APPOINTMENTS_VIEW),
  );

  /** Phones start on the day view; a 390px week grid helps nobody. */
  protected readonly initialView: CalendarViewName =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 48rem)').matches
      ? 'timeGridDay'
      : 'timeGridWeek';

  protected readonly todayLabel = computed(() =>
    formatLongDate(new Date().toISOString(), this.store.clinicSchedule()?.timezone),
  );

  protected readonly title = computed(() => this.store.visibleRange()?.title ?? '');

  protected readonly summary = computed(() => {
    const count = this.store.todayCount();
    const parts = [`${count} appointment${count === 1 ? '' : 's'} today`];
    if (this.store.waitingCount() > 0) {
      parts.push(`${this.store.waitingCount()} waiting`);
    }
    if (this.store.inTreatmentCount() > 0) {
      parts.push(`${this.store.inTreatmentCount()} in treatment`);
    }
    return parts.join(' · ');
  });

  protected readonly receptionAppointments = computed(() => {
    const rows = [...this.store.needsAttention(), ...this.store.receptionQueue()];
    return [...new Map(rows.map((appointment) => [appointment.id, appointment])).values()];
  });

  ngOnInit(): void {
    this.store.setView(this.initialView);
    // Settings may have changed since the last visit; refresh the authoritative
    // clinic policy whenever the Schedule route is entered.
    void this.store.initialize(true);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.store.drawerMode()) {
      this.store.closeDrawer();
    }
  }

  changeView(view: CalendarViewName): void {
    this.store.setView(view);
    this.calendar()?.changeView(view);
  }

  onSlotSelected(slot: SlotSelection): void {
    if (!this.canEdit()) {
      return;
    }
    this.store.openCreate({ startAt: slot.startAt, endAt: slot.endAt });
  }

  onNewAppointment(): void {
    this.store.openCreate(null);
  }

  async onReschedule(request: RescheduleRequest): Promise<void> {
    const persisted = await this.store.reschedule(
      request.appointmentId,
      request.startAt,
      request.endAt,
    );
    if (!persisted) {
      request.revert();
      if (this.store.capacityWarning()) {
        this.store.openEdit(request.appointmentId, true);
      }
    }
  }

  protected appointmentTime(iso: string): string {
    return formatTime(iso, this.store.clinicSchedule()?.timezone);
  }

  protected receptionNote(appointment: Appointment): string {
    if (['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) return 'Late arrival';
    if (appointment.arrivedAt) {
      const minutes = Math.round(
        (new Date(appointment.arrivedAt).getTime() - new Date(appointment.startAt).getTime()) /
          60_000,
      );
      if (minutes < 0) return `${Math.abs(minutes)} min early`;
      if (minutes > 0) return `${minutes} min late`;
    }
    return appointment.status.replace('_', ' ').toLowerCase();
  }
}

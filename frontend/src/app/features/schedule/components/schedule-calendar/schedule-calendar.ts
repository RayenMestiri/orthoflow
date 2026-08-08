import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import {
  FullCalendarComponent,
  FullCalendarModule,
  type CalendarOptions,
  type DateSelectInfo,
  type EventChangeInfo,
  type EventClickInfo,
  type EventInput,
} from '@fullcalendar/angular';
import classicTheme from '@fullcalendar/angular/themes/classic';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import interactionPlugin from '@fullcalendar/angular/interaction';
import timeGridPlugin from '@fullcalendar/angular/timegrid';
import type {
  Appointment,
  CalendarViewName,
  ClinicScheduleConfiguration,
  VisibleRange,
} from '../../models/schedule.models';
import {
  buildScheduleGridOptions,
  toCalendarEvents,
  type AppointmentEventProps,
} from '../../utils/appointment-calendar.mapper';
import { formatTime } from '../../utils/appointment-time.utils';
import { AppointmentStatusBadge } from '../appointment-status-badge/appointment-status-badge';

export interface RescheduleRequest {
  appointmentId: string;
  startAt: string;
  endAt: string;
  /** Puts the event back where it was if persistence fails. */
  revert: () => void;
}

export interface SlotSelection {
  startAt: string;
  endAt: string;
}

/**
 * The only component that talks to FullCalendar.
 *
 * It renders whatever appointments it is given and reports user gestures
 * upward as domain events; fetching, optimistic bookkeeping and error handling
 * are the store's job.
 */
@Component({
  selector: 'app-schedule-calendar',
  imports: [FullCalendarModule, AppointmentStatusBadge],
  templateUrl: './schedule-calendar.html',
  styleUrl: './schedule-calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleCalendar {
  readonly appointments = input.required<Appointment[]>();
  readonly clinicSchedule = input.required<ClinicScheduleConfiguration>();
  readonly initialView = input.required<CalendarViewName>();
  readonly canEdit = input(false);

  readonly rangeChanged = output<VisibleRange>();
  readonly slotSelected = output<SlotSelection>();
  readonly appointmentOpened = output<string>();
  readonly rescheduleRequested = output<RescheduleRequest>();

  private readonly calendarRef = viewChild.required(FullCalendarComponent);

  protected readonly events = computed<EventInput[]>(() => toCalendarEvents(this.appointments()));

  /**
   * Static-ish options: geometry from clinic hours plus wiring. Events flow
   * through the separate `events` input so a data refresh never rebuilds the
   * whole calendar.
   */
  protected readonly options = computed<CalendarOptions>(() => ({
    plugins: [classicTheme, timeGridPlugin, dayGridPlugin, interactionPlugin],
    initialView: this.initialView(),
    // The OrthoFlow toolbar replaces FullCalendar's — see schedule-toolbar.
    headerToolbar: false,
    height: '100%',
    ...buildScheduleGridOptions(this.clinicSchedule()),
    selectable: this.canEdit(),
    selectMirror: true,
    editable: this.canEdit(),
    eventDurationEditable: this.canEdit(),
    datesSet: (arg) => {
      this.rangeChanged.emit({
        start: arg.start.toISOString(),
        end: arg.end.toISOString(),
        title: arg.view.title,
      });
    },
    select: (arg: DateSelectInfo) => {
      this.getApi().unselect();
      this.slotSelected.emit({ startAt: arg.start.toISOString(), endAt: arg.end.toISOString() });
    },
    eventClick: (arg: EventClickInfo) => {
      this.appointmentOpened.emit(arg.event.id);
    },
    eventChange: (info: EventChangeInfo) => {
      // Covers both drag (move) and resize. FullCalendar has already applied
      // the change optimistically; `revert` undoes it if the backend refuses.
      const { event, revert } = info;
      if (!event.start || !event.end) {
        revert();
        return;
      }
      this.rescheduleRequested.emit({
        appointmentId: event.id,
        startAt: event.start.toISOString(),
        endAt: event.end.toISOString(),
        revert,
      });
    },
  }));

  protected readonly formatTime = (iso: string) => formatTime(iso, this.clinicSchedule().timezone);

  protected appointmentOf(arg: { event?: { extendedProps?: unknown } }): Appointment | undefined {
    return (arg?.event?.extendedProps as AppointmentEventProps | undefined)?.appointment;
  }

  protected isLate(appointment: Appointment): boolean {
    return (
      ['SCHEDULED', 'CONFIRMED'].includes(appointment.status) &&
      new Date(appointment.startAt).getTime() < Date.now()
    );
  }

  protected patientInitials(appointment: Appointment): string {
    return (appointment.patient?.fullName ?? 'Patient')
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  // --- navigation API used by the page/toolbar -----------------------------

  goToPrevious(): void {
    this.getApi().prev();
  }

  goToNext(): void {
    this.getApi().next();
  }

  goToToday(): void {
    this.getApi().today();
  }

  changeView(view: CalendarViewName): void {
    this.getApi().changeView(view);
  }

  private getApi() {
    return this.calendarRef().getApi();
  }
}

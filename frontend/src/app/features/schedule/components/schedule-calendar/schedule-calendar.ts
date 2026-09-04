import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  OnDestroy,
  output,
  signal,
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
import {
  computeCollisionGroups,
  type CollisionMetadata,
} from '../../utils/collision-layout.utils';
import { formatTime } from '../../utils/appointment-time.utils';
import { AppointmentStatusBadge } from '../appointment-status-badge/appointment-status-badge';
import { CollisionGroupPopover } from '../collision-group-popover/collision-group-popover';

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
  imports: [FullCalendarModule, AppointmentStatusBadge, CollisionGroupPopover],
  templateUrl: './schedule-calendar.html',
  styleUrl: './schedule-calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-sun-closed]': 'closedWeekdays().includes("sun")',
    '[class.is-sat-closed]': 'closedWeekdays().includes("sat")',
    '[class.is-fri-closed]': 'closedWeekdays().includes("fri")',
    '[class.is-mon-closed]': 'closedWeekdays().includes("mon")',
    '[class.is-tue-closed]': 'closedWeekdays().includes("tue")',
    '[class.is-wed-closed]': 'closedWeekdays().includes("wed")',
    '[class.is-thu-closed]': 'closedWeekdays().includes("thu")',
  },
})
export class ScheduleCalendar implements OnDestroy {
  readonly appointments = input.required<Appointment[]>();
  readonly clinicSchedule = input.required<ClinicScheduleConfiguration>();
  readonly initialView = input.required<CalendarViewName>();
  readonly canEdit = input(false);

  readonly rangeChanged = output<VisibleRange>();
  readonly slotSelected = output<SlotSelection>();
  readonly appointmentOpened = output<string>();
  readonly rescheduleRequested = output<RescheduleRequest>();

  private readonly calendarRef = viewChild.required(FullCalendarComponent);

  private hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly hoveredGroupId = signal<string | null>(null);
  protected readonly hoveredAppointmentId = signal<string | null>(null);
  protected readonly activePopoverGroup = signal<CollisionMetadata | null>(null);

  protected readonly closedWeekdays = computed<string[]>(() => {
    const wh = this.clinicSchedule()?.workingHours;
    if (!wh) return ['sun'];
    const dayAbbrs: Record<string, string> = {
      monday: 'mon',
      tuesday: 'tue',
      wednesday: 'wed',
      thursday: 'thu',
      friday: 'fri',
      saturday: 'sat',
      sunday: 'sun',
    };
    return Object.entries(wh)
      .filter(([_, periods]) => !periods || periods.length === 0)
      .map(([day]) => dayAbbrs[day] ?? day.slice(0, 3));
  });

  protected readonly collisionMap = computed<Map<string, CollisionMetadata>>(() =>
    computeCollisionGroups(this.appointments())
  );

  protected readonly events = computed<EventInput[]>(() =>
    toCalendarEvents(this.appointments(), this.collisionMap())
  );

  constructor() {
    effect(() => {
      // Whenever appointments change, ensure the FullCalendar instance updates its DOM
      this.events();
      try {
        const calendar = this.calendarRef()?.getApi();
        if (calendar) {
          calendar.render();
        }
      } catch {
        // Safe before calendar view is fully initialized
      }
    });
  }

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
    eventDidMount: (info) => {
      const viewType = info.view.type;

      if (viewType === 'timeGridWeek') {
        const harness = (info.el.closest('.fc-timegrid-event-harness') ?? info.el.parentElement) as HTMLElement | null;
        if (harness) {
          harness.classList.add('fc-timegrid-event-harness');
          harness.style.setProperty('left', '2px', 'important');
          harness.style.setProperty('right', '2px', 'important');
          harness.style.setProperty('inset-inline-start', '2px', 'important');
          harness.style.setProperty('inset-inline-end', '2px', 'important');
          harness.style.setProperty('width', 'calc(100% - 4px)', 'important');
          harness.style.setProperty('min-width', 'calc(100% - 4px)', 'important');
          harness.style.setProperty('max-width', 'calc(100% - 4px)', 'important');
          harness.style.setProperty('box-sizing', 'border-box', 'important');

          const props = info.event.extendedProps as AppointmentEventProps | undefined;
          const collision = props?.collision;

          if (collision) {
            harness.setAttribute('data-collision-group', collision.groupId);
            harness.setAttribute('data-group-index', String(collision.groupIndex));
            harness.setAttribute('data-group-total', String(collision.groupTotal));

            if (collision.isOverlapping) {
              harness.classList.add('fc-harness--overlapping');
              const stagger = collision.staggerIndex ?? collision.groupIndex;
              harness.style.setProperty('--staircase-index', String(stagger));
              harness.style.setProperty('--group-index', String(collision.groupIndex));
              harness.style.setProperty('--staircase-total', String(collision.groupTotal));
              harness.style.setProperty('z-index', String(10 + collision.groupIndex), 'important');
            } else {
              harness.classList.remove('fc-harness--overlapping');
              harness.style.removeProperty('--staircase-index');
              harness.style.removeProperty('--group-index');
              harness.style.removeProperty('--staircase-total');
              harness.style.removeProperty('z-index');
            }

            if (collision.hiddenInCompact) {
              harness.classList.add('fc-harness--compact-hidden');
            } else {
              harness.classList.remove('fc-harness--compact-hidden');
            }
          }
        }
      } else if (viewType === 'timeGridDay') {
        const harness = (info.el.closest('.fc-timegrid-event-harness') ?? info.el.parentElement) as HTMLElement | null;
        if (harness) {
          harness.classList.add('fc-timegrid-event-harness');
          harness.style.setProperty('box-sizing', 'border-box', 'important');
          harness.style.removeProperty('left');
          harness.style.removeProperty('right');
          harness.style.removeProperty('inset-inline-start');
          harness.style.removeProperty('inset-inline-end');
          harness.style.removeProperty('width');
          harness.style.removeProperty('min-width');
          harness.style.removeProperty('max-width');
          harness.style.removeProperty('--staircase-index');
          harness.style.removeProperty('--group-index');
          harness.style.removeProperty('--staircase-total');
          harness.style.removeProperty('z-index');
        }
      }
    },
  }));

  protected formatTime(iso: string): string {
    return formatTime(iso, this.clinicSchedule().timezone);
  }

  protected formatTimeRange(appointment: Appointment): string {
    const tz = this.clinicSchedule().timezone;
    return `${formatTime(appointment.startAt, tz)} — ${formatTime(appointment.endAt, tz)}`;
  }

  protected formatMonthTooltip(appointment: Appointment): string {
    const time = this.formatTimeRange(appointment);
    const type = appointment.appointmentType?.name ?? 'Consultation';
    const treat = appointment.treatment?.label ? ` · ${appointment.treatment.label}` : '';
    return `${time} — ${appointment.patient?.fullName ?? 'Patient'} (${type}${treat})`;
  }

  protected appointmentOf(arg: { event?: { extendedProps?: unknown } }): Appointment | undefined {
    return (arg?.event?.extendedProps as AppointmentEventProps | undefined)?.appointment;
  }

  protected collisionOf(arg: { event?: { extendedProps?: unknown } }): CollisionMetadata | undefined {
    return (arg?.event?.extendedProps as AppointmentEventProps | undefined)?.collision;
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

  ngOnDestroy(): void {
    if (this.hoverLeaveTimer) {
      clearTimeout(this.hoverLeaveTimer);
      this.hoverLeaveTimer = null;
    }
  }

  protected onEventMouseEnter(collision?: CollisionMetadata, appointmentId?: string): void {
    if (this.hoverLeaveTimer) {
      clearTimeout(this.hoverLeaveTimer);
      this.hoverLeaveTimer = null;
    }
    if (collision?.isOverlapping) {
      this.hoveredGroupId.set(collision.groupId);
      this.hoveredAppointmentId.set(appointmentId ?? null);
      this.updateGroupHoverClasses(collision.groupId, appointmentId ?? null);
    }
  }

  protected onEventMouseLeave(): void {
    if (this.hoverLeaveTimer) {
      clearTimeout(this.hoverLeaveTimer);
    }
    this.hoverLeaveTimer = setTimeout(() => {
      const currentGroupId = this.hoveredGroupId();
      this.hoveredGroupId.set(null);
      this.hoveredAppointmentId.set(null);
      if (currentGroupId) {
        this.clearGroupHoverClasses(currentGroupId);
      }
      this.hoverLeaveTimer = null;
    }, 45);
  }

  private updateGroupHoverClasses(groupId: string, activeId: string | null): void {
    const harnesses = document.querySelectorAll(
      `[data-collision-group="${groupId}"]`
    ) as NodeListOf<HTMLElement>;

    harnesses.forEach((el) => {
      el.classList.add('is-group-hovered');
      el.classList.remove('is-card-hovered');
      const baseZ = Number(el.getAttribute('data-group-index') ?? '0');
      el.style.setProperty('z-index', String(30 + baseZ), 'important');
    });

    if (activeId) {
      const activeCard = document.querySelector(`[data-appointment-id="${activeId}"]`);
      const activeHarness = (activeCard?.closest('.fc-timegrid-event-harness') ??
        activeCard?.closest('.fc-timegrid-col-events > div')) as HTMLElement | null;
      if (activeHarness) {
        activeHarness.classList.add('is-card-hovered');
        activeHarness.style.setProperty('z-index', '120', 'important');
      }
    }
  }

  private clearGroupHoverClasses(groupId: string): void {
    const harnesses = document.querySelectorAll(
      `[data-collision-group="${groupId}"]`
    ) as NodeListOf<HTMLElement>;

    harnesses.forEach((el) => {
      el.classList.remove('is-group-hovered', 'is-card-hovered');
      const baseZ = Number(el.getAttribute('data-group-index') ?? '0');
      el.style.setProperty('z-index', String(10 + baseZ), 'important');
    });
  }

  protected openCollisionPopover(collision: CollisionMetadata, event?: MouseEvent): void {
    event?.stopPropagation();
    this.activePopoverGroup.set(collision);
  }

  protected closeCollisionPopover(): void {
    this.activePopoverGroup.set(null);
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


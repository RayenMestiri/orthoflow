import type { CalendarOptions, EventInput } from '@fullcalendar/angular';
import type { Appointment, ClinicScheduleConfiguration } from '../models/schedule.models';
import { minutesToDuration, toCalendarTime } from './appointment-time.utils';
import { computeCollisionGroups, type CollisionMetadata } from './collision-layout.utils';

/**
 * Translation layer between the schedule domain and FullCalendar.
 *
 * Everything FullCalendar-specific lives here and in the calendar component;
 * the store and drawer never see an `EventInput`.
 */

export interface AppointmentEventProps {
  appointment: Appointment;
  collision?: CollisionMetadata;
}

export function toCalendarEvents(
  appointments: Appointment[],
  collisionMap?: Map<string, CollisionMetadata>
): EventInput[] {
  const computedMap = collisionMap ?? computeCollisionGroups(appointments);
  return (
    appointments
      // A cancelled slot is free again — keeping the block on the grid would
      // make the day look fuller than it is. History stays in the backend.
      .filter((appointment) => appointment.status !== 'CANCELLED')
      .map((appointment) => {
        const collision = computedMap.get(appointment.id);
        return {
          id: appointment.id,
          start: appointment.startAt,
          end: appointment.endAt,
          title: appointment.patient?.fullName ?? 'Appointment',
          editable: !['COMPLETED', 'NO_SHOW'].includes(appointment.status),
          classNames: [
            `fc-event--status-${appointment.status.toLowerCase()}`,
            `fc-event--capacity-${appointment.slotCapacity?.state?.toLowerCase() ?? 'available'}`,
            collision?.isOverlapping ? 'fc-event--overlapping' : 'fc-event--solo',
            collision?.isOverlapping ? `fc-event--overlap-idx-${collision.groupIndex}` : '',
            collision?.isOverlapping ? `fc-event--overlap-total-${collision.groupTotal}` : '',
            collision?.hiddenInCompact ? 'fc-event--compact-hidden' : '',
          ].filter(Boolean),
          extendedProps: { appointment, collision } satisfies AppointmentEventProps,
        };
      })
  );
}

/**
 * Grid geometry derived from the clinic's opening pattern: slot size, the
 * earliest open and latest close across the week, business-hour shading and
 * the operational defaults (15-minute granularity, no all-day lane).
 */
export function buildScheduleGridOptions(schedule: ClinicScheduleConfiguration): CalendarOptions {
  const dayNumbers = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 0,
  } as const;
  const periods = Object.entries(schedule.workingHours).flatMap(([weekday, dayPeriods]) =>
    dayPeriods.map((period) => ({ weekday: weekday as keyof typeof dayNumbers, ...period })),
  );
  const earliestOpen = periods.reduce(
    (earliest, period) => (period.start < earliest ? period.start : earliest),
    periods[0]?.start ?? '08:00',
  );
  const latestClose = periods.reduce(
    (latest, period) => (period.end > latest ? period.end : latest),
    periods[0]?.end ?? '18:00',
  );
  const slotDuration = minutesToDuration(schedule.scheduling.slotIntervalMinutes);

  return {
    timeZone: schedule.timezone,
    slotDuration,
    snapDuration: slotDuration,
    slotMinTime: toCalendarTime(earliestOpen),
    slotMaxTime: toCalendarTime(latestClose),
    businessHours: periods.map((period) => ({
      daysOfWeek: [dayNumbers[period.weekday]],
      startTime: toCalendarTime(period.start),
      endTime: toCalendarTime(period.end),
    })),
    selectConstraint: 'businessHours',
    eventConstraint: 'businessHours',
    // Monday-first week: matches how the clinic thinks about its diary.
    firstDay: 1,
    allDaySlot: false,
    nowIndicator: true,
    expandRows: true,
    displayEventTime: false,
    eventMinHeight: 18,
    slotEventOverlap: true,
    eventOrder: 'start,-duration,title',
    dayMaxEvents: false,
    dayMaxEventRows: false,
    views: {
      timeGridWeek: {
        className: 'fc-timeGridWeek-view',
        dayMaxEvents: false,
        dayMaxEventRows: false,
        slotEventOverlap: false,
      },
      timeGridDay: {
        className: 'fc-timeGridDay-view',
        dayMaxEvents: false,
        dayMaxEventRows: false,
        slotEventOverlap: true,
      },
      dayGridMonth: {
        className: 'fc-dayGridMonth-view',
        dayMaxEvents: 3,
        dayMaxEventRows: 3,
        moreLinkClick: 'popover',
      },
    },
    longPressDelay: 180,
    scrollTime: toCalendarTime(earliestOpen),
  };
}


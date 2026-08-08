import type { CalendarOptions, EventInput } from '@fullcalendar/angular';
import type { Appointment, ClinicScheduleSettings } from '../models/schedule.models';
import { minutesToDuration, toCalendarTime } from './appointment-time.utils';

/**
 * Translation layer between the schedule domain and FullCalendar.
 *
 * Everything FullCalendar-specific lives here and in the calendar component;
 * the store and drawer never see an `EventInput`.
 */

export interface AppointmentEventProps {
  appointment: Appointment;
}

export function toCalendarEvents(appointments: Appointment[]): EventInput[] {
  return (
    appointments
      // A cancelled slot is free again — keeping the block on the grid would
      // make the day look fuller than it is. History stays in the backend.
      .filter((appointment) => appointment.status !== 'CANCELLED')
      .map((appointment) => ({
        id: appointment.id,
        start: appointment.startAt,
        end: appointment.endAt,
        title: appointment.patient?.fullName ?? 'Appointment',
        editable: !['COMPLETED', 'NO_SHOW'].includes(appointment.status),
        extendedProps: { appointment } satisfies AppointmentEventProps,
      }))
  );
}

/**
 * Grid geometry derived from the clinic's opening pattern: slot size, the
 * earliest open and latest close across the week, business-hour shading and
 * the operational defaults (15-minute granularity, no all-day lane).
 */
export function buildScheduleGridOptions(schedule: ClinicScheduleSettings): CalendarOptions {
  const openDays = schedule.workingHours.filter((day) => !day.isClosed);
  const earliestOpen = openDays.reduce(
    (earliest, day) => (day.opensAt < earliest ? day.opensAt : earliest),
    '08:00',
  );
  const latestClose = openDays.reduce(
    (latest, day) => (day.closesAt > latest ? day.closesAt : latest),
    '18:00',
  );

  return {
    slotDuration: minutesToDuration(schedule.slotMinutes),
    slotMinTime: toCalendarTime(earliestOpen),
    slotMaxTime: toCalendarTime(latestClose),
    businessHours: openDays.map((day) => ({
      daysOfWeek: [day.weekday],
      startTime: toCalendarTime(day.opensAt),
      endTime: toCalendarTime(day.closesAt),
    })),
    // Monday-first week: matches how the clinic thinks about its diary.
    firstDay: 1,
    allDaySlot: false,
    nowIndicator: true,
    expandRows: true,
    displayEventTime: false,
    eventMinHeight: 18,
    slotEventOverlap: false,
    eventOrder: 'start,-duration,title',
    eventOrderStrict: true,
    dayMaxEventRows: 4,
    longPressDelay: 180,
    scrollTime: toCalendarTime(earliestOpen),
  };
}

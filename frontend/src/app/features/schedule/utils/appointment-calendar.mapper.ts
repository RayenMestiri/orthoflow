import type { CalendarOptions, EventInput } from '@fullcalendar/angular';
import type { Appointment, ClinicScheduleConfiguration } from '../models/schedule.models';
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
    slotEventOverlap: false,
    eventOrder: 'start,-duration,title',
    eventOrderStrict: true,
    dayMaxEventRows: 4,
    longPressDelay: 180,
    scrollTime: toCalendarTime(earliestOpen),
  };
}

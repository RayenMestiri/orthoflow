import { Pipe, type PipeTransform } from '@angular/core';

export type PortalDateStyle = 'appointment' | 'date' | 'dateTime' | 'fullDate' | 'time';

const OPTIONS: Record<PortalDateStyle, Intl.DateTimeFormatOptions> = {
  appointment: {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  },
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  dateTime: {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  },
  fullDate: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
};

@Pipe({ name: 'portalDate' })
export class PortalDatePipe implements PipeTransform {
  transform(
    value: string | Date | null | undefined,
    timezone: string | null | undefined,
    style: PortalDateStyle = 'date',
  ): string {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf())) return '—';

    try {
      return new Intl.DateTimeFormat('en-GB', {
        ...OPTIONS[style],
        timeZone: timezone || 'UTC',
      }).format(date);
    } catch {
      return '—';
    }
  }
}

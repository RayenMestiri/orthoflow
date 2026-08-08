import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { CalendarViewName } from '../../models/schedule.models';

/**
 * OrthoFlow-native calendar toolbar. FullCalendar's own header is disabled;
 * this component drives navigation through the calendar API via the page.
 */
@Component({
  selector: 'app-schedule-toolbar',
  templateUrl: './schedule-toolbar.html',
  styleUrl: './schedule-toolbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleToolbar {
  readonly title = input.required<string>();
  readonly activeView = input.required<CalendarViewName>();
  readonly isLoading = input(false);

  readonly previous = output<void>();
  readonly next = output<void>();
  readonly today = output<void>();
  readonly viewChange = output<CalendarViewName>();
  readonly newAppointment = output<void>();

  readonly views: readonly { name: CalendarViewName; label: string }[] = [
    { name: 'timeGridDay', label: 'Day' },
    { name: 'timeGridWeek', label: 'Week' },
    { name: 'dayGridMonth', label: 'Month' },
  ];
}

import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
} from '@angular/core';
import type { Appointment } from '../../models/schedule.models';
import type { CollisionMetadata } from '../../utils/collision-layout.utils';
import { formatTime } from '../../utils/appointment-time.utils';
import { AppointmentStatusBadge } from '../appointment-status-badge/appointment-status-badge';

@Component({
  selector: 'app-collision-group-popover',
  standalone: true,
  imports: [AppointmentStatusBadge],
  templateUrl: './collision-group-popover.html',
  styleUrl: './collision-group-popover.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollisionGroupPopover {
  readonly group = input.required<CollisionMetadata>();
  readonly timezone = input<string>('UTC');
  readonly activeAppointmentId = input<string | null>(null);

  readonly appointmentSelected = output<string>();
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  protected formatRange(appt: Appointment): string {
    const tz = this.timezone();
    return `${formatTime(appt.startAt, tz)} — ${formatTime(appt.endAt, tz)}`;
  }

  protected patientInitials(appt: Appointment): string {
    return (appt.patient?.fullName ?? 'P')
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  protected onSelect(appointmentId: string): void {
    this.appointmentSelected.emit(appointmentId);
    this.closed.emit();
  }
}

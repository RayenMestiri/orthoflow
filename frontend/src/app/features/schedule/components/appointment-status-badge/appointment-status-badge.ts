import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { STATUS_LABELS, type AppointmentStatus } from '../../models/schedule.models';

/**
 * Status chip used on calendar events and in the drawer.
 *
 * The dot plus text (never color alone) carries the state; colors come from
 * the design tokens via the `data-status` attribute in SCSS.
 */
@Component({
  selector: 'app-appointment-status-badge',
  template: `
    <span class="status-badge" [attr.data-status]="status()">
      <i aria-hidden="true"></i>{{ label() }}
    </span>
  `,
  styleUrl: './appointment-status-badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppointmentStatusBadge {
  readonly status = input.required<AppointmentStatus>();
  readonly label = computed(() => STATUS_LABELS[this.status()]);
}

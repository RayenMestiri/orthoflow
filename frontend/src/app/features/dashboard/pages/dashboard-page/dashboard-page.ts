import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth.store';
import { CLINIC_ROLES, PLATFORM_ROLES } from '../../../../core/auth/auth.models';

interface RoleBriefing {
  eyebrow: string;
  title: string;
  description: string;
  priorities: readonly string[];
}

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  readonly auth = inject(AuthStore);
  readonly today = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  readonly briefing = computed<RoleBriefing>(() => {
    if (this.auth.user()?.platformRole === PLATFORM_ROLES.SUPER_ADMIN) {
      return {
        eyebrow: 'Platform operations',
        title: 'Keep every clinic operating on a trusted foundation.',
        description:
          'Platform telemetry and clinic oversight will appear here as those milestones are connected.',
        priorities: [
          'Review platform configuration',
          'Confirm support access policy',
          'Prepare clinic onboarding',
        ],
      };
    }

    switch (this.auth.activeMembership()?.role) {
      case CLINIC_ROLES.CLINIC_OWNER:
        return {
          eyebrow: 'Owner briefing',
          title: 'Set the clinic up once, then let the team move with clarity.',
          description:
            'Your foundation is ready. Complete the operating details that will shape scheduling, access, and traceability.',
          priorities: [
            'Confirm clinic details',
            'Prepare staff invitations',
            'Define the first visit types',
          ],
        };
      case CLINIC_ROLES.ORTHODONTIST:
      case CLINIC_ROLES.DENTIST:
        return {
          eyebrow: 'Clinical briefing',
          title: 'Your clinical day will start with context, not card clutter.',
          description:
            'Appointments, treatment milestones, and relevant handoffs will meet here when their modules are connected.',
          priorities: [
            'Review your clinic membership',
            'Confirm notification preferences',
            'Prepare treatment workflow',
          ],
        };
      case CLINIC_ROLES.SECRETARY:
        return {
          eyebrow: 'Front desk briefing',
          title: 'A calm desk begins with one reliable operational view.',
          description:
            'Scheduling, arrival states, guardian details, and physical-payment records will stay coordinated here.',
          priorities: [
            'Confirm front desk access',
            'Prepare visit categories',
            'Review clinic contact details',
          ],
        };
      default:
        return {
          eyebrow: 'Team briefing',
          title: 'See the handoff, understand the next action, keep care moving.',
          description:
            'Your dashboard will surface the clinic context assigned to your role without exposing restricted work.',
          priorities: [
            'Confirm your profile',
            'Review your clinic role',
            'Prepare your daily workflow',
          ],
        };
    }
  });
}

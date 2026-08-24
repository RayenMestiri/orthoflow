import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { PermissionService, PERMISSIONS } from '../../../core/auth/permissions';
import type { NotificationItem } from '../models/notification.models';

@Injectable({ providedIn: 'root' })
export class NotificationNavigationService {
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionService);

  async open(notification: NotificationItem): Promise<boolean> {
    const context = notification.context;
    switch (context.target) {
      case 'TASK':
        return context.taskId && this.permissions.can(PERMISSIONS.TASKS_VIEW)
          ? this.router.navigate(['/app/tasks'], { queryParams: { taskId: context.taskId } })
          : false;
      case 'APPOINTMENT':
        return context.appointmentId && this.permissions.can(PERMISSIONS.APPOINTMENTS_VIEW)
          ? this.router.navigate(['/app/schedule'], {
              queryParams: { appointmentId: context.appointmentId },
            })
          : false;
      case 'PATIENT_CONSENTS':
        return context.patientId && this.permissions.can(PERMISSIONS.CONSENTS_VIEW)
          ? this.router.navigate(['/app/patients', context.patientId], {
              queryParams: { tab: 'consents' },
            })
          : false;
      case 'PATIENT_DOCUMENTS':
        return context.patientId && this.permissions.can(PERMISSIONS.GENERATED_DOCUMENTS_VIEW)
          ? this.router.navigate(['/app/patients', context.patientId], {
              queryParams: { tab: 'media' },
            })
          : false;
      case 'CARE_CONTINUITY':
        return this.permissions.can(PERMISSIONS.FOLLOWUPS_VIEW)
          ? this.router.navigate(['/app/follow-ups'], {
              queryParams: { patientId: context.patientId },
            })
          : false;
    }
  }
}

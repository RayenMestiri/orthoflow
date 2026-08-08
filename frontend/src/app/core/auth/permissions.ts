import { inject, Injectable } from '@angular/core';
import { AuthStore } from './auth.store';
import { CLINIC_ROLES, PLATFORM_ROLES, type ClinicRole } from './auth.models';

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  PATIENTS_VIEW: 'patients.view',
  PATIENTS_CREATE: 'patients.create',
  PATIENTS_UPDATE: 'patients.update',
  PATIENTS_ARCHIVE: 'patients.archive',
  APPOINTMENTS_VIEW: 'appointments.view',
  TREATMENTS_VIEW: 'treatments.view',
  CASH_RECORDS_VIEW: 'cash-records.view',
  STAFF_MANAGE: 'staff.manage',
  CLINIC_SETTINGS_MANAGE: 'clinic-settings.manage',
  PLATFORM_ADMIN: 'platform.admin',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const clinicalPermissions: Permission[] = [
  PERMISSIONS.DASHBOARD_VIEW,
  PERMISSIONS.PATIENTS_VIEW,
  PERMISSIONS.PATIENTS_CREATE,
  PERMISSIONS.PATIENTS_UPDATE,
  PERMISSIONS.PATIENTS_ARCHIVE,
  PERMISSIONS.APPOINTMENTS_VIEW,
  PERMISSIONS.TREATMENTS_VIEW,
  PERMISSIONS.CASH_RECORDS_VIEW,
];

export const ROLE_PERMISSIONS: Record<ClinicRole, readonly Permission[]> = {
  [CLINIC_ROLES.CLINIC_OWNER]: [
    ...clinicalPermissions,
    PERMISSIONS.STAFF_MANAGE,
    PERMISSIONS.CLINIC_SETTINGS_MANAGE,
  ],
  [CLINIC_ROLES.ORTHODONTIST]: clinicalPermissions,
  [CLINIC_ROLES.DENTIST]: clinicalPermissions,
  [CLINIC_ROLES.SECRETARY]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PATIENTS_VIEW,
    PERMISSIONS.PATIENTS_CREATE,
    PERMISSIONS.PATIENTS_UPDATE,
    PERMISSIONS.APPOINTMENTS_VIEW,
    PERMISSIONS.CASH_RECORDS_VIEW,
  ],
  [CLINIC_ROLES.ASSISTANT]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PATIENTS_VIEW,
    PERMISSIONS.APPOINTMENTS_VIEW,
    PERMISSIONS.TREATMENTS_VIEW,
  ],
};

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly auth = inject(AuthStore);

  can(permission: Permission): boolean {
    if (this.auth.user()?.platformRole === PLATFORM_ROLES.SUPER_ADMIN) {
      return true;
    }
    const role = this.auth.activeMembership()?.role;
    return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
  }
}

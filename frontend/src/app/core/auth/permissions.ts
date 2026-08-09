import { inject, Injectable } from '@angular/core';
import { AuthStore } from './auth.store';
import { CLINIC_ROLES, PLATFORM_ROLES, type ClinicRole } from './auth.models';

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  PATIENTS_VIEW: 'patients.view',
  PATIENTS_CREATE: 'patients.create',
  PATIENTS_UPDATE: 'patients.update',
  PATIENTS_ARCHIVE: 'patients.archive',
  PATIENT_MEDIA_VIEW: 'patient-media.view',
  PATIENT_MEDIA_MANAGE_ADMIN: 'patient-media.manage-administrative',
  PATIENT_MEDIA_MANAGE_CLINICAL: 'patient-media.manage-clinical',
  APPOINTMENTS_VIEW: 'appointments.view',
  TREATMENTS_VIEW: 'treatments.view',
  /** Plan, edit and drive the lifecycle of a course of care — a clinical decision. */
  TREATMENTS_MANAGE: 'treatments.manage',
  CASH_RECORDS_VIEW: 'cash-records.view',
  /** Record money the clinic physically received. Not an online payment. */
  CASH_RECORDS_RECORD: 'cash-records.record',
  /** Void an incorrect record. Conservative: owner only. */
  CASH_RECORDS_CANCEL: 'cash-records.cancel',
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
  PERMISSIONS.PATIENT_MEDIA_VIEW,
  PERMISSIONS.PATIENT_MEDIA_MANAGE_ADMIN,
  PERMISSIONS.PATIENT_MEDIA_MANAGE_CLINICAL,
  PERMISSIONS.APPOINTMENTS_VIEW,
  PERMISSIONS.TREATMENTS_VIEW,
  PERMISSIONS.TREATMENTS_MANAGE,
  PERMISSIONS.CASH_RECORDS_VIEW,
  // Practitioners take money at the chair; cancelling stays with the owner.
  PERMISSIONS.CASH_RECORDS_RECORD,
];

export const ROLE_PERMISSIONS: Record<ClinicRole, readonly Permission[]> = {
  [CLINIC_ROLES.CLINIC_OWNER]: [
    ...clinicalPermissions,
    PERMISSIONS.STAFF_MANAGE,
    PERMISSIONS.CLINIC_SETTINGS_MANAGE,
    PERMISSIONS.CASH_RECORDS_CANCEL,
  ],
  [CLINIC_ROLES.ORTHODONTIST]: clinicalPermissions,
  [CLINIC_ROLES.DENTIST]: clinicalPermissions,
  [CLINIC_ROLES.SECRETARY]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PATIENTS_VIEW,
    PERMISSIONS.PATIENTS_CREATE,
    PERMISSIONS.PATIENTS_UPDATE,
    PERMISSIONS.PATIENT_MEDIA_VIEW,
    PERMISSIONS.PATIENT_MEDIA_MANAGE_ADMIN,
    PERMISSIONS.APPOINTMENTS_VIEW,
    PERMISSIONS.TREATMENTS_VIEW,
    // The front desk is who physically takes the money.
    PERMISSIONS.CASH_RECORDS_VIEW,
    PERMISSIONS.CASH_RECORDS_RECORD,
  ],
  [CLINIC_ROLES.ASSISTANT]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PATIENTS_VIEW,
    PERMISSIONS.PATIENT_MEDIA_VIEW,
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

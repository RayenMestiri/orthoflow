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
  APPOINTMENTS_UPDATE: 'appointments.update',
  APPOINTMENTS_CANCEL: 'appointments.cancel',
  /**
   * Putting a patient in the chair and declaring the visit over are clinical
   * acts. The front desk still checks people in and moves the queue; it just
   * does not open or close the treatment itself. Mirrors the server rule —
   * hiding these buttons is courtesy, the API is what enforces it.
   */
  APPOINTMENTS_START_VISIT: 'appointments.start-visit',
  APPOINTMENTS_COMPLETE_VISIT: 'appointments.complete-visit',
  TREATMENTS_VIEW: 'treatments.view',
  /** Plan, edit and drive the lifecycle of a course of care — a clinical decision. */
  TREATMENTS_MANAGE: 'treatments.manage',
  CLINICAL_VISITS_VIEW: 'clinical-visits.view',
  CLINICAL_VISITS_MANAGE: 'clinical-visits.manage',
  CLINICAL_VISITS_EDIT_COMPLETED: 'clinical-visits.edit-completed',
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
  PERMISSIONS.APPOINTMENTS_UPDATE,
  PERMISSIONS.APPOINTMENTS_CANCEL,
  PERMISSIONS.APPOINTMENTS_START_VISIT,
  PERMISSIONS.APPOINTMENTS_COMPLETE_VISIT,
  PERMISSIONS.TREATMENTS_VIEW,
  PERMISSIONS.TREATMENTS_MANAGE,
  PERMISSIONS.CLINICAL_VISITS_VIEW,
  PERMISSIONS.CLINICAL_VISITS_MANAGE,
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
    PERMISSIONS.CLINICAL_VISITS_EDIT_COMPLETED,
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
    PERMISSIONS.APPOINTMENTS_UPDATE,
    PERMISSIONS.APPOINTMENTS_CANCEL,
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

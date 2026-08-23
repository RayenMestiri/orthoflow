import { describe, expect, it } from 'vitest';
import { CLINIC_ROLES } from './auth.models';
import { PERMISSIONS, ROLE_PERMISSIONS } from './permissions';

describe('role permissions', () => {
  it('allows every clinic role to open the shared dashboard', () => {
    for (const role of Object.values(CLINIC_ROLES)) {
      expect(ROLE_PERMISSIONS[role]).toContain(PERMISSIONS.DASHBOARD_VIEW);
    }
  });

  it('keeps staff and clinic settings restricted to the clinic owner', () => {
    expect(ROLE_PERMISSIONS.CLINIC_OWNER).toContain(PERMISSIONS.STAFF_MANAGE);
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.STAFF_MANAGE);
    expect(ROLE_PERMISSIONS.ORTHODONTIST).not.toContain(PERMISSIONS.CLINIC_SETTINGS_MANAGE);
  });

  it('keeps guardian portal administration restricted to the clinic owner', () => {
    expect(ROLE_PERMISSIONS.CLINIC_OWNER).toContain(PERMISSIONS.PORTAL_ACCESS_MANAGE);
    expect(ROLE_PERMISSIONS.ORTHODONTIST).not.toContain(PERMISSIONS.PORTAL_ACCESS_MANAGE);
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.PORTAL_ACCESS_MANAGE);
    expect(ROLE_PERMISSIONS.ASSISTANT).not.toContain(PERMISSIONS.PORTAL_ACCESS_MANAGE);
  });

  it('gives front-desk roles read-only treatment and cash-record visibility', () => {
    expect(ROLE_PERMISSIONS.SECRETARY).toContain(PERMISSIONS.CASH_RECORDS_VIEW);
    expect(ROLE_PERMISSIONS.SECRETARY).toContain(PERMISSIONS.TREATMENTS_VIEW);
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.TREATMENTS_MANAGE);
  });

  it('keeps patient administration role-aware', () => {
    expect(ROLE_PERMISSIONS.CLINIC_OWNER).toContain(PERMISSIONS.PATIENTS_ARCHIVE);
    expect(ROLE_PERMISSIONS.ORTHODONTIST).toContain(PERMISSIONS.PATIENTS_UPDATE);
    expect(ROLE_PERMISSIONS.SECRETARY).toContain(PERMISSIONS.PATIENTS_CREATE);
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.PATIENTS_ARCHIVE);
    expect(ROLE_PERMISSIONS.ASSISTANT).toContain(PERMISSIONS.PATIENTS_VIEW);
    expect(ROLE_PERMISSIONS.ASSISTANT).not.toContain(PERMISSIONS.PATIENTS_UPDATE);
  });

  it('mirrors the clinical visit boundary from the API', () => {
    expect(ROLE_PERMISSIONS.CLINIC_OWNER).toContain(PERMISSIONS.CLINICAL_VISITS_EDIT_COMPLETED);
    expect(ROLE_PERMISSIONS.ORTHODONTIST).toContain(PERMISSIONS.CLINICAL_VISITS_MANAGE);
    expect(ROLE_PERMISSIONS.DENTIST).not.toContain(PERMISSIONS.CLINICAL_VISITS_EDIT_COMPLETED);
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.CLINICAL_VISITS_VIEW);
    expect(ROLE_PERMISSIONS.ASSISTANT).not.toContain(PERMISSIONS.CLINICAL_VISITS_VIEW);
  });

  it('opens Reports to practitioners and front desk while keeping assistants out', () => {
    expect(ROLE_PERMISSIONS.CLINIC_OWNER).toContain(PERMISSIONS.REPORTS_VIEW);
    expect(ROLE_PERMISSIONS.ORTHODONTIST).toContain(PERMISSIONS.REPORTS_VIEW);
    expect(ROLE_PERMISSIONS.SECRETARY).toContain(PERMISSIONS.REPORTS_VIEW);
    expect(ROLE_PERMISSIONS.ASSISTANT).not.toContain(PERMISSIONS.REPORTS_VIEW);
  });
});

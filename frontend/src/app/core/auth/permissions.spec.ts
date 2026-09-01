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

describe('SECRETARY permission matrix — least-privilege enforcement', () => {
  const sec = ROLE_PERMISSIONS.SECRETARY;

  describe('allowed operations', () => {
    it('can read and create patients', () => {
      expect(sec).toContain(PERMISSIONS.PATIENTS_VIEW);
      expect(sec).toContain(PERMISSIONS.PATIENTS_CREATE);
      expect(sec).toContain(PERMISSIONS.PATIENTS_UPDATE);
    });

    it('can fully manage the appointment diary', () => {
      expect(sec).toContain(PERMISSIONS.APPOINTMENTS_VIEW);
      expect(sec).toContain(PERMISSIONS.APPOINTMENTS_UPDATE);
      expect(sec).toContain(PERMISSIONS.APPOINTMENTS_CANCEL);
    });

    it('can record cash payments and read receipts', () => {
      expect(sec).toContain(PERMISSIONS.CASH_RECORDS_VIEW);
      expect(sec).toContain(PERMISSIONS.CASH_RECORDS_RECORD);
    });

    it('can read and create tasks', () => {
      expect(sec).toContain(PERMISSIONS.TASKS_VIEW);
      expect(sec).toContain(PERMISSIONS.TASKS_CREATE);
    });

    it('can read and create guardians', () => {
      expect(sec).toContain(PERMISSIONS.PATIENT_MEDIA_VIEW);
    });

    it('can read notifications and communications', () => {
      expect(sec).toContain(PERMISSIONS.NOTIFICATIONS_VIEW);
      expect(sec).toContain(PERMISSIONS.COMMUNICATIONS_VIEW);
    });

    it('can generate administrative and financial documents', () => {
      expect(sec).toContain(PERMISSIONS.GENERATED_DOCUMENTS_VIEW);
      expect(sec).toContain(PERMISSIONS.GENERATED_DOCUMENTS_GENERATE_ADMIN);
      expect(sec).toContain(PERMISSIONS.GENERATED_DOCUMENTS_GENERATE_FINANCIAL);
    });
  });

  describe('forbidden operations', () => {
    it('CANNOT cancel or void cash records', () => {
      expect(sec).not.toContain(PERMISSIONS.CASH_RECORDS_CANCEL);
    });

    it('CANNOT archive patients', () => {
      expect(sec).not.toContain(PERMISSIONS.PATIENTS_ARCHIVE);
    });

    it('CANNOT start or complete a clinical visit (chair work)', () => {
      expect(sec).not.toContain(PERMISSIONS.APPOINTMENTS_START_VISIT);
      expect(sec).not.toContain(PERMISSIONS.APPOINTMENTS_COMPLETE_VISIT);
    });

    it('CANNOT manage treatment lifecycle or create clinical records', () => {
      expect(sec).not.toContain(PERMISSIONS.TREATMENTS_MANAGE);
      expect(sec).not.toContain(PERMISSIONS.CLINICAL_VISITS_MANAGE);
      expect(sec).not.toContain(PERMISSIONS.CLINICAL_VISITS_VIEW);
    });

    it('CANNOT manage clinic settings or staff', () => {
      expect(sec).not.toContain(PERMISSIONS.CLINIC_SETTINGS_MANAGE);
      expect(sec).not.toContain(PERMISSIONS.STAFF_MANAGE);
    });

    it('CANNOT manage the guardian portal', () => {
      expect(sec).not.toContain(PERMISSIONS.PORTAL_ACCESS_MANAGE);
    });

    it('CANNOT generate clinical documents', () => {
      expect(sec).not.toContain(PERMISSIONS.GENERATED_DOCUMENTS_GENERATE_CLINICAL);
      expect(sec).not.toContain(PERMISSIONS.GENERATED_DOCUMENTS_VOID);
    });

    it('CANNOT revoke consents', () => {
      expect(sec).not.toContain(PERMISSIONS.CONSENTS_REVOKE);
      expect(sec).not.toContain(PERMISSIONS.CONSENTS_VOID);
    });
  });
});

import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import type { ClinicRecord } from '../../src/modules/clinics/clinic.types.js';
import { DEFAULT_CLINIC_SETTINGS } from '../../src/modules/clinics/clinic-settings.types.js';
import type {
  GuardianRecord,
  PatientGuardianRecord,
} from '../../src/modules/guardians/guardian.types.js';
import type { PatientRecord } from '../../src/modules/patients/patient.types.js';
import { RecipientResolverService } from '../../src/modules/communications/recipient-resolver.service.js';

const clinicId = new Types.ObjectId();
const patientId = new Types.ObjectId();
const guardianId = new Types.ObjectId();
const now = new Date('2026-08-24T10:00:00.000Z');
const clinic = {
  _id: clinicId,
  name: 'Clinic',
  settings: DEFAULT_CLINIC_SETTINGS,
} as unknown as ClinicRecord;
const minor = {
  _id: patientId,
  clinicId,
  firstName: 'Rayen',
  birthDate: new Date('2015-01-01T00:00:00.000Z'),
  email: 'child@example.com',
  phone: null,
} as unknown as PatientRecord;
const guardian = {
  _id: guardianId,
  clinicId,
  firstName: 'Sarah',
  email: 'parent@example.com',
  phone: '+21620111222',
} as unknown as GuardianRecord;

function relationship(authorized: boolean) {
  return {
    _id: new Types.ObjectId(),
    clinicId,
    patientId,
    guardianId,
    isPrimary: true,
    communicationAuthorized: authorized,
    contactPreference: 'EMAIL',
  } as unknown as PatientGuardianRecord;
}

describe('RecipientResolverService', () => {
  it('uses the authorized primary guardian for a minor', async () => {
    const guardians = { findByIdInClinic: vi.fn().mockResolvedValue(guardian) };
    const relationships = { listByPatient: vi.fn().mockResolvedValue([relationship(true)]) };
    const service = new RecipientResolverService(guardians as never, relationships as never);
    await expect(service.resolve(clinic, minor, now)).resolves.toMatchObject({
      recipientType: 'GUARDIAN',
      recipientId: guardianId.toString(),
      channel: 'EMAIL',
      destination: 'parent@example.com',
    });
  });

  it('does not fall back to the minor when guardian communication is unauthorized', async () => {
    const guardians = { findByIdInClinic: vi.fn() };
    const relationships = { listByPatient: vi.fn().mockResolvedValue([relationship(false)]) };
    const service = new RecipientResolverService(guardians as never, relationships as never);
    await expect(service.resolve(clinic, minor, now)).resolves.toBeNull();
    expect(guardians.findByIdInClinic).not.toHaveBeenCalled();
  });

  it('requires authorization for an explicitly selected guardian by default', async () => {
    const guardians = { findByIdInClinic: vi.fn().mockResolvedValue(guardian) };
    const relationships = { listByPatient: vi.fn().mockResolvedValue([relationship(false)]) };
    const service = new RecipientResolverService(guardians as never, relationships as never);

    await expect(service.resolve(clinic, minor, now, guardianId.toString())).resolves.toBeNull();
    await expect(
      service.resolve(clinic, minor, now, guardianId.toString(), true),
    ).resolves.toMatchObject({ recipientId: guardianId.toString() });
  });
});

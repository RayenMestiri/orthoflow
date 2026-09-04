import type { PatientDto, PatientRecord } from './patient.types.js';

/** Birth dates are calendar facts, not instants — serialize as `YYYY-MM-DD`. */
function toCalendarDate(value: Date | null): string | null {
  return value ? (value.toISOString().split('T')[0] ?? null) : null;
}

function ageFromBirthDate(value: Date | null): number | null {
  if (!value) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - value.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < value.getUTCMonth() ||
    (today.getUTCMonth() === value.getUTCMonth() && today.getUTCDate() < value.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function toPatientDto(
  record: PatientRecord,
  primaryGuardian: PatientDto['primaryGuardian'] = null,
  visits: {
    lastVisit?: PatientDto['lastVisit'];
    nextVisit?: PatientDto['nextVisit'];
  } = {},
): PatientDto {
  return {
    id: record._id.toString(),
    clinicId: record.clinicId.toString(),
    firstName: record.firstName,
    lastName: record.lastName,
    fullName: `${record.firstName} ${record.lastName}`.trim(),
    referenceNumber: record.referenceNumber ?? null,
    birthDate: toCalendarDate(record.birthDate),
    age: ageFromBirthDate(record.birthDate),
    gender: record.gender,
    phone: record.phone ?? null,
    email: record.email ?? null,
    address: {
      line1: record.address?.line1 ?? null,
      city: record.address?.city ?? null,
      postalCode: record.address?.postalCode ?? null,
      country: record.address?.country ?? null,
    },
    status: record.status,
    notes: record.notes ?? null,
    createdBy: record.createdBy.toString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    archivedAt: record.archivedAt?.toISOString() ?? null,
    primaryGuardian,
    lastVisit: visits.lastVisit ?? null,
    nextVisit: visits.nextVisit ?? null,
  };
}

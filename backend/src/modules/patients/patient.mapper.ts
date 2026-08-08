import type { PatientDto, PatientRecord } from './patient.types.js';

/** Birth dates are calendar facts, not instants — serialize as `YYYY-MM-DD`. */
function toCalendarDate(value: Date | null): string | null {
  return value ? (value.toISOString().split('T')[0] ?? null) : null;
}

export function toPatientDto(record: PatientRecord): PatientDto {
  return {
    id: record._id.toString(),
    clinicId: record.clinicId.toString(),
    firstName: record.firstName,
    lastName: record.lastName,
    fullName: `${record.firstName} ${record.lastName}`.trim(),
    birthDate: toCalendarDate(record.birthDate),
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
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    archivedAt: record.archivedAt?.toISOString() ?? null,
  };
}

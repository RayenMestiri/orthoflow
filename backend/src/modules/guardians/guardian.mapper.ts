import type { GuardianDto, GuardianRecord, PatientGuardianRecord } from './guardian.types.js';

export function toGuardianDto(
  guardian: GuardianRecord,
  relationship: PatientGuardianRecord,
): GuardianDto {
  return {
    id: guardian._id.toString(),
    firstName: guardian.firstName,
    lastName: guardian.lastName,
    fullName: `${guardian.firstName} ${guardian.lastName}`.trim(),
    phone: guardian.phone ?? null,
    email: guardian.email ?? null,
    relationship: relationship.relationship,
    isPrimary: relationship.isPrimary,
    financiallyResponsible: relationship.financiallyResponsible,
    contactPreference: relationship.contactPreference,
    // Legacy relationships remain opted out until staff records authorization.
    communicationAuthorized: relationship.communicationAuthorized ?? false,
    createdAt: guardian.createdAt.toISOString(),
    updatedAt: guardian.updatedAt.toISOString(),
  };
}

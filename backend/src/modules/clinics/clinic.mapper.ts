import type { ClinicDto, ClinicRecord } from './clinic.types.js';

export function toClinicDto(record: ClinicRecord): ClinicDto {
  return {
    id: record._id.toString(),
    name: record.name,
    slug: record.slug,
    legalName: record.legalName ?? null,
    email: record.email ?? null,
    phone: record.phone ?? null,
    address: {
      line1: record.address?.line1 ?? null,
      line2: record.address?.line2 ?? null,
      city: record.address?.city ?? null,
      postalCode: record.address?.postalCode ?? null,
      country: record.address?.country ?? null,
    },
    timezone: record.timezone,
    currency: record.currency,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

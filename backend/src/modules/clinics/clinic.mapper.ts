import { DEFAULT_CLINIC_SCHEDULE, type ClinicDto, type ClinicRecord } from './clinic.types.js';

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
    schedule: {
      slotMinutes: record.schedule?.slotMinutes ?? DEFAULT_CLINIC_SCHEDULE.slotMinutes,
      // Clinics created before scheduling existed have no stored pattern; the
      // calendar still needs one, so fall back rather than render an empty grid.
      workingHours: (record.schedule?.workingHours?.length
        ? record.schedule.workingHours
        : DEFAULT_CLINIC_SCHEDULE.workingHours
      ).map((day) => ({
        weekday: day.weekday,
        opensAt: day.opensAt,
        closesAt: day.closesAt,
        isClosed: day.isClosed,
      })),
    },
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

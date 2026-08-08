import type { AppointmentTypeDto, AppointmentTypeRecord } from './appointment-type.types.js';

export function toAppointmentTypeDto(record: AppointmentTypeRecord): AppointmentTypeDto {
  return {
    id: record._id.toString(),
    clinicId: record.clinicId.toString(),
    name: record.name,
    durationMinutes: record.durationMinutes,
    color: record.color ?? null,
    description: record.description ?? null,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

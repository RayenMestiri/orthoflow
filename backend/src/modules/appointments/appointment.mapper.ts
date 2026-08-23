import type { AppointmentTypeRecord } from '../appointment-types/appointment-type.types.js';
import type { PatientRecord } from '../patients/patient.types.js';
import type { TreatmentRecord } from '../treatments/treatment.types.js';
import type {
  AppointmentDto,
  AppointmentPatientSummary,
  AppointmentRecord,
  AppointmentTypeSummary,
  AppointmentTreatmentSummary,
} from './appointment.types.js';

function treatmentLabel(record: TreatmentRecord): string {
  if (record.customTypeLabel) return record.customTypeLabel;
  const words = record.type.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function toTreatmentSummary(record: TreatmentRecord): AppointmentTreatmentSummary {
  return { id: record._id.toString(), label: treatmentLabel(record), status: record.status };
}

function computeAge(birthDate: Date | null): number | null {
  if (!birthDate) {
    return null;
  }
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const hadBirthday =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
  if (!hadBirthday) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

export function toPatientSummary(record: PatientRecord): AppointmentPatientSummary {
  return {
    id: record._id.toString(),
    fullName: `${record.firstName} ${record.lastName}`.trim(),
    phone: record.phone ?? null,
    age: computeAge(record.birthDate),
  };
}

export function toTypeSummary(record: AppointmentTypeRecord): AppointmentTypeSummary {
  return {
    id: record._id.toString(),
    name: record.name,
    color: record.color ?? null,
    durationMinutes: record.durationMinutes,
  };
}

/**
 * Maps a persistence record to the calendar's shape.
 *
 * Patient and type summaries are joined at read time by the service — copied
 * names inside the appointment document would go stale the first time a typo
 * in a patient's name is fixed.
 */
export function toAppointmentDto(
  record: AppointmentRecord,
  patient: PatientRecord | undefined,
  appointmentType: AppointmentTypeRecord | undefined,
  treatment: TreatmentRecord | undefined,
  slotCapacity: AppointmentDto['slotCapacity'],
): AppointmentDto {
  return {
    id: record._id.toString(),
    clinicId: record.clinicId.toString(),
    patientId: record.patientId.toString(),
    treatmentId: record.treatmentId?.toString() ?? null,
    retentionPlanId: record.retentionPlanId?.toString() ?? null,
    doctorId: record.doctorId.toString(),
    appointmentTypeId: record.appointmentTypeId.toString(),

    startAt: record.startAt.toISOString(),
    endAt: record.endAt.toISOString(),
    durationMinutes: record.durationMinutes,

    status: record.status,
    note: record.note ?? null,

    cancellationReason: record.cancellationReason ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    cancelledBy: record.cancelledBy?.toString() ?? null,
    arrivedAt: record.arrivedAt?.toISOString() ?? null,
    waitingAt: record.waitingAt?.toISOString() ?? null,
    treatmentStartedAt: record.treatmentStartedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    noShowAt: record.noShowAt?.toISOString() ?? null,
    markedNoShowBy: record.markedNoShowBy?.toString() ?? null,
    overbookingOverride: record.overbookingOverride ?? false,
    overbookingApprovedBy: record.overbookingApprovedBy?.toString() ?? null,

    createdBy: record.createdBy.toString(),
    updatedBy: record.updatedBy?.toString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),

    patient: patient ? toPatientSummary(patient) : null,
    treatment: treatment ? toTreatmentSummary(treatment) : null,
    appointmentType: appointmentType ? toTypeSummary(appointmentType) : null,
    slotCapacity,
  };
}

import {
  OCCUPYING_TREATMENT_STATUSES,
  type TreatmentDto,
  type TreatmentProgressDto,
  type TreatmentProgressRecord,
  type TreatmentRecord,
  type TreatmentWithProgressDto,
} from './treatment.types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Start and end dates are calendar facts, not instants — serialize as `YYYY-MM-DD`. */
function toCalendarDate(value: Date | null): string | null {
  return value ? (value.toISOString().split('T')[0] ?? null) : null;
}

/**
 * How long the course has run.
 *
 * Measured to the actual end once finished, otherwise to today — which is what
 * a clinician reading "month 14 of treatment" expects to see.
 */
function durationDays(record: TreatmentRecord, now: Date): number | null {
  if (!record.startDate) {
    return null;
  }
  const end = record.actualEndDate ?? now;
  const elapsed = Math.floor((end.getTime() - record.startDate.getTime()) / MS_PER_DAY);
  return elapsed > 0 ? elapsed : 0;
}

export function toTreatmentDto(record: TreatmentRecord, now: Date = new Date()): TreatmentDto {
  return {
    id: record._id.toString(),
    clinicId: record.clinicId.toString(),
    patientId: record.patientId.toString(),
    doctorId: record.doctorId.toString(),

    treatmentType: record.treatmentType,
    status: record.status,

    startDate: toCalendarDate(record.startDate),
    expectedEndDate: toCalendarDate(record.expectedEndDate),
    actualEndDate: toCalendarDate(record.actualEndDate),

    notes: record.notes ?? null,
    totalPlannedCost: record.totalPlannedCost ?? null,
    cancellationReason: record.cancellationReason ?? null,

    durationDays: durationDays(record, now),
    isCurrent: OCCUPYING_TREATMENT_STATUSES.includes(record.status),

    createdBy: record.createdBy.toString(),
    updatedBy: record.updatedBy?.toString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toTreatmentProgressDto(record: TreatmentProgressRecord): TreatmentProgressDto {
  return {
    id: record._id.toString(),
    treatmentId: record.treatmentId.toString(),
    patientId: record.patientId.toString(),
    occurredAt: record.occurredAt.toISOString(),
    type: record.type,
    note: record.note ?? null,
    createdBy: record.createdBy.toString(),
    createdAt: record.createdAt.toISOString(),
  };
}

export function toTreatmentWithProgressDto(
  record: TreatmentRecord,
  progress: TreatmentProgressRecord[],
  now: Date = new Date(),
): TreatmentWithProgressDto {
  return {
    ...toTreatmentDto(record, now),
    progress: progress.map(toTreatmentProgressDto),
  };
}

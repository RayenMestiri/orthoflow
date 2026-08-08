import {
  TREATMENT_STATUSES,
  type TreatmentDto,
  type TreatmentMilestoneDto,
  type TreatmentMilestoneRecord,
  type TreatmentRecord,
  type TreatmentWithMilestonesDto,
} from './treatment.types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toCalendarDate(value: Date | null): string | null {
  return value ? (value.toISOString().split('T')[0] ?? null) : null;
}

function durationDays(record: TreatmentRecord, now: Date): number | null {
  if (!record.startDate) return null;
  const end = record.completedAt ?? now;
  return Math.max(0, Math.floor((end.getTime() - record.startDate.getTime()) / MS_PER_DAY));
}

export function toTreatmentDto(record: TreatmentRecord, now: Date = new Date()): TreatmentDto {
  return {
    id: record._id.toString(),
    clinicId: record.clinicId.toString(),
    patientId: record.patientId.toString(),
    doctorId: record.doctorId.toString(),
    type: record.type,
    customTypeLabel: record.customTypeLabel ?? null,
    status: record.status,
    startDate: toCalendarDate(record.startDate),
    expectedEndDate: toCalendarDate(record.expectedEndDate),
    completedAt: record.completedAt?.toISOString() ?? null,
    agreedPrice: record.agreedPrice ?? null,
    notes: record.notes ?? null,
    cancellationReason: record.cancellationReason ?? null,
    durationDays: durationDays(record, now),
    isCurrent: record.status === TREATMENT_STATUSES.ACTIVE,
    createdBy: record.createdBy.toString(),
    updatedBy: record.updatedBy?.toString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toTreatmentMilestoneDto(record: TreatmentMilestoneRecord): TreatmentMilestoneDto {
  return {
    id: record._id.toString(),
    treatmentId: record.treatmentId.toString(),
    patientId: record.patientId.toString(),
    type: record.type,
    title: record.title,
    description: record.description ?? null,
    occurredAt: record.occurredAt.toISOString(),
    createdBy: record.createdBy.toString(),
    updatedBy: record.updatedBy?.toString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toTreatmentWithMilestonesDto(
  record: TreatmentRecord,
  milestones: TreatmentMilestoneRecord[],
  now: Date = new Date(),
): TreatmentWithMilestonesDto {
  return {
    ...toTreatmentDto(record, now),
    milestones: milestones.map(toTreatmentMilestoneDto),
  };
}

import type {
  RetainerDeviceDto,
  RetainerDeviceRecord,
  RetentionPlanDto,
  RetentionPlanRecord,
} from './retention.types.js';

export function toRetainerDeviceDto(
  record: RetainerDeviceRecord,
  includePrivate: boolean,
): RetainerDeviceDto {
  return {
    id: record._id.toString(),
    retentionPlanId: record.retentionPlanId.toString(),
    type: record.type,
    customTypeLabel: record.customTypeLabel ?? null,
    arch: record.arch,
    status: record.status,
    deliveredAt: record.deliveredAt.toISOString(),
    endedAt: record.endedAt?.toISOString() ?? null,
    replacesRetainerId: record.replacesRetainerId?.toString() ?? null,
    notes: includePrivate ? (record.notes ?? null) : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toRetentionPlanDto(
  record: RetentionPlanRecord,
  retainers: RetainerDeviceRecord[],
  includePrivate: boolean,
): RetentionPlanDto {
  return {
    id: record._id.toString(),
    clinicId: record.clinicId.toString(),
    patientId: record.patientId.toString(),
    treatmentId: record.treatmentId.toString(),
    status: record.status,
    initialControlRecommendedAt: record.initialControlRecommendedAt?.toISOString() ?? null,
    startedAt: record.startedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    cancellationReason: includePrivate ? (record.cancellationReason ?? null) : null,
    completionReason: includePrivate ? (record.completionReason ?? null) : null,
    notes: includePrivate ? (record.notes ?? null) : null,
    retainers: retainers.map((retainer) => toRetainerDeviceDto(retainer, includePrivate)),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

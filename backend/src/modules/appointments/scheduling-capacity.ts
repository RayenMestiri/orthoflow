import type {
  AppointmentRecord,
  SlotCapacityInfo,
  SlotCapacityState,
} from './appointment.types.js';

type TimeRange = Pick<AppointmentRecord, 'startAt' | 'endAt'>;

export interface CapacityEvaluation {
  existingPeak: number;
  resultingPeak: number;
  recommendedCapacity: number;
  state: SlotCapacityState;
  requiresConfirmation: boolean;
}

/** Half-open ranges: an appointment ending at 10:00 does not overlap one starting at 10:00. */
export function peakConcurrency(ranges: TimeRange[], windowStart: Date, windowEnd: Date): number {
  const points = ranges.flatMap((range) => [
    { at: Math.max(range.startAt.getTime(), windowStart.getTime()), delta: 1 },
    { at: Math.min(range.endAt.getTime(), windowEnd.getTime()), delta: -1 },
  ]);
  points.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  for (const point of points) {
    current += point.delta;
    peak = Math.max(peak, current);
  }
  return peak;
}

export function capacityState(concurrency: number, capacity: number): SlotCapacityState {
  if (concurrency <= 1) return 'AVAILABLE';
  if (concurrency < capacity) return 'BUSY';
  if (concurrency === capacity) return 'AT_CAPACITY';
  return 'OVERBOOKED';
}

export function evaluateProposedCapacity(
  overlaps: AppointmentRecord[],
  startAt: Date,
  endAt: Date,
  recommendedCapacity: number,
): CapacityEvaluation {
  const existingPeak = peakConcurrency(overlaps, startAt, endAt);
  const resultingPeak = existingPeak + 1;
  return {
    existingPeak,
    resultingPeak,
    recommendedCapacity,
    state: capacityState(resultingPeak, recommendedCapacity),
    requiresConfirmation: resultingPeak > recommendedCapacity,
  };
}

export function capacityInfoForRecord(
  record: AppointmentRecord,
  records: AppointmentRecord[],
  recommendedCapacity: number,
): SlotCapacityInfo {
  const concurrency = peakConcurrency(
    records.filter(
      (candidate) =>
        candidate.startAt < record.endAt &&
        candidate.endAt > record.startAt &&
        !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(candidate.status),
    ),
    record.startAt,
    record.endAt,
  );
  return {
    state: capacityState(concurrency, recommendedCapacity),
    concurrentAppointments: concurrency,
    recommendedCapacity,
    overbookingOverride: record.overbookingOverride ?? false,
  };
}

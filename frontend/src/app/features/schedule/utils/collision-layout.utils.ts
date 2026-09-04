import type { Appointment } from '../models/schedule.models';

export interface CollisionMetadata {
  /** Unique identifier for the collision cluster */
  groupId: string;
  /** 0-based index in the staircase / cascade stacking order */
  groupIndex: number;
  /** Total appointments in this collision cluster */
  groupTotal: number;
  /** True if more than 1 appointment overlaps in this cluster */
  isOverlapping: boolean;
  /** True if 5 or more appointments overlap simultaneously */
  isExtremeDensity: boolean;
  /** True if hidden by default in compact mode (index >= 3 in 5+ groups) */
  hiddenInCompact: boolean;
  /** All appointments belonging to this collision cluster */
  groupAppointments: Appointment[];
  /** Vertical staircase stagger index: increments only when appointments start close together */
  staggerIndex?: number;
}

/**
 * Groups appointments into connected collision clusters per day column.
 *
 * An overlap occurs when:
 *   max(startA, startB) < min(endA, endB)
 *
 * Adjacent appointments (e.g. 09:00–09:30 and 09:30–10:00) do NOT overlap.
 * Cancelled appointments are ignored.
 */
export function computeCollisionGroups(appointments: Appointment[]): Map<string, CollisionMetadata> {
  const collisionMap = new Map<string, CollisionMetadata>();

  // Filter out cancelled appointments
  const activeAppointments = appointments.filter((a) => a.status !== 'CANCELLED');
  if (activeAppointments.length === 0) {
    return collisionMap;
  }

  // Partition by calendar day (YYYY-MM-DD in local time)
  const byDay = new Map<string, Appointment[]>();
  for (const appointment of activeAppointments) {
    const start = new Date(appointment.startAt);
    const dayKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const dayList = byDay.get(dayKey) ?? [];
    dayList.push(appointment);
    byDay.set(dayKey, dayList);
  }

  // For each day, find connected overlapping components
  for (const [dayKey, dayAppts] of byDay.entries()) {
    // Sort by startAt ascending, then endAt descending, then by id
    const sorted = [...dayAppts].sort((a, b) => {
      const startDiff = new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = new Date(b.endAt).getTime() - new Date(a.endAt).getTime();
      if (endDiff !== 0) return endDiff;
      return a.id.localeCompare(b.id);
    });

    const clusters: Appointment[][] = [];
    let currentCluster: Appointment[] = [];
    let currentMaxEnd = 0;

    for (const appt of sorted) {
      const apptStart = new Date(appt.startAt).getTime();
      const apptEnd = new Date(appt.endAt).getTime();

      if (currentCluster.length === 0) {
        currentCluster.push(appt);
        currentMaxEnd = apptEnd;
      } else if (apptStart < currentMaxEnd) {
        // Overlaps with current cluster
        currentCluster.push(appt);
        currentMaxEnd = Math.max(currentMaxEnd, apptEnd);
      } else {
        // Does not overlap (apptStart >= currentMaxEnd), close previous cluster
        clusters.push(currentCluster);
        currentCluster = [appt];
        currentMaxEnd = apptEnd;
      }
    }

    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // Assign collision metadata to each appointment in each cluster
    clusters.forEach((cluster, clusterIdx) => {
      const groupTotal = cluster.length;
      const isOverlapping = groupTotal > 1;
      const isExtremeDensity = groupTotal >= 5;
      const firstStart = new Date(cluster[0].startAt).getTime();
      const groupId = `cg_${dayKey}_${firstStart}_${clusterIdx}`;

      let currentStagger = 0;
      let lastStart = -1;

      cluster.forEach((appt, groupIndex) => {
        const apptStart = new Date(appt.startAt).getTime();
        if (groupIndex === 0) {
          currentStagger = 0;
        } else if (apptStart - lastStart < 20 * 60 * 1000) {
          currentStagger += 1;
        } else {
          currentStagger = 0;
        }
        lastStart = apptStart;

        const metadata: CollisionMetadata = {
          groupId,
          groupIndex,
          staggerIndex: currentStagger,
          groupTotal,
          isOverlapping,
          isExtremeDensity,
          hiddenInCompact: false,
          groupAppointments: cluster,
        };
        collisionMap.set(appt.id, metadata);
      });
    });
  }

  return collisionMap;
}

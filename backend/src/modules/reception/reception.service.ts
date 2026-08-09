import { clinicCalendarDate, clinicDayBounds } from '../../common/utils/clinic-day.js';
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import { receptionRepository, type ReceptionRepository } from './reception.repository.js';
import {
  FLOW_GROUPS,
  FLOW_GROUP_ORDER,
  minutesSince,
  resolveFlowGroup,
  type ReceptionBoard,
  type ReceptionRow,
  type ReceptionSummary,
} from './reception.types.js';

/**
 * Builds today's clinic flow.
 *
 * Reads the existing appointment collection and groups it operationally. It
 * performs no writes: every action a receptionist takes goes through the
 * appointment lifecycle endpoints that already exist, so there is exactly one
 * place where a status transition is validated and audited.
 */
export class ReceptionService {
  constructor(
    private readonly reception: ReceptionRepository = receptionRepository,
    private readonly clinics: ClinicRepository = clinicRepository,
  ) {}

  async getToday(clinicId: string, now: Date = new Date()): Promise<ReceptionBoard> {
    const clinic = await this.clinics.findById(clinicId);
    const timezone = clinic?.timezone || 'UTC';

    // The clinic's day, not UTC's — an evening appointment must not fall into
    // tomorrow's board for a clinic east of Greenwich.
    const { start, end } = clinicDayBounds(timezone, now);
    const records = await this.reception.listDay(clinicId, start, end);

    const rows = records
      .map((record) => this.toRow(record, now))
      .sort((a, b) => this.compareRows(a, b));

    const { year, month, day } = clinicCalendarDate(now, timezone);
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return {
      date,
      timezone,
      // Lets the client detect clock skew rather than trusting the browser.
      generatedAt: now.toISOString(),
      summary: this.summarize(rows),
      rows,
    };
  }

  private toRow(
    record: Awaited<ReturnType<ReceptionRepository['listDay']>>[number],
    now: Date,
  ): ReceptionRow {
    const startAt = new Date(record.startAt);
    const flowGroup = resolveFlowGroup(record.status, startAt, now);

    return {
      appointmentId: String(record._id),
      patientId: String(record.patientId),
      patientName:
        `${record.patientFirstName} ${record.patientLastName}`.trim() || 'Unknown patient',
      appointmentTypeName: record.appointmentTypeName,
      treatmentLabel: record.treatmentCustomLabel ?? this.formatTreatmentType(record.treatmentType),

      startAt: startAt.toISOString(),
      endAt: new Date(record.endAt).toISOString(),
      durationMinutes: record.durationMinutes,

      status: record.status,
      flowGroup,
      lateByMinutes: flowGroup === FLOW_GROUPS.LATE ? minutesSince(startAt, now) : null,

      arrivedAt: record.arrivedAt ? new Date(record.arrivedAt).toISOString() : null,
      /**
       * WAITING has no timestamp of its own in the appointment model, and
       * adding one would mean migrating a live collection for a value we can
       * already answer. `arrivedAt` is when the patient started waiting: the
       * ARRIVED → WAITING move is a desk formality, not a new clinical fact.
       */
      waitingSince: record.arrivedAt ? new Date(record.arrivedAt).toISOString() : null,
      treatmentStartedAt: record.treatmentStartedAt
        ? new Date(record.treatmentStartedAt).toISOString()
        : null,
      completedAt: record.completedAt ? new Date(record.completedAt).toISOString() : null,
      noShowAt: record.noShowAt ? new Date(record.noShowAt).toISOString() : null,

      note: record.note ?? null,
      cancellationReason: record.cancellationReason ?? null,
    };
  }

  /**
   * Operational order: the chair first, then the waiting room, then the door.
   *
   * Within a group, time decides — earliest arrival among those waiting,
   * earliest slot among those still expected — so the next person to deal with
   * is always the top row of the relevant section.
   */
  private compareRows(a: ReceptionRow, b: ReceptionRow): number {
    const groupDelta =
      FLOW_GROUP_ORDER.indexOf(a.flowGroup) - FLOW_GROUP_ORDER.indexOf(b.flowGroup);
    if (groupDelta !== 0) {
      return groupDelta;
    }

    // Those already in the building are ordered by how long they have been
    // here; everyone else by their slot.
    const aKey = a.arrivedAt ?? a.startAt;
    const bKey = b.arrivedAt ?? b.startAt;
    return new Date(aKey).getTime() - new Date(bKey).getTime();
  }

  private summarize(rows: ReceptionRow[]): ReceptionSummary {
    const count = (predicate: (row: ReceptionRow) => boolean): number =>
      rows.filter(predicate).length;

    return {
      total: rows.length,
      completed: count((row) => row.status === 'COMPLETED'),
      waiting: count((row) => row.flowGroup === FLOW_GROUPS.WAITING),
      inTreatment: count((row) => row.flowGroup === FLOW_GROUPS.IN_TREATMENT),
      late: count((row) => row.flowGroup === FLOW_GROUPS.LATE),
      upcoming: count((row) => row.flowGroup === FLOW_GROUPS.UPCOMING),
      noShow: count((row) => row.status === 'NO_SHOW'),
      cancelled: count((row) => row.status === 'CANCELLED'),
    };
  }

  /** `METAL_BRACES` → `Metal braces`. Presentation only; Treatment owns the enum. */
  private formatTreatmentType(type: string | null): string | null {
    if (!type) {
      return null;
    }
    const words = type.toLowerCase().replaceAll('_', ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
}

export const receptionService = new ReceptionService();

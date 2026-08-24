import type { FastifyBaseLogger } from 'fastify';
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import {
  careContinuityService,
  type CareContinuityService,
} from '../follow-ups/care-continuity.service.js';
import {
  communicationEventService,
  type CommunicationEventService,
} from './notification.service.js';
import { NOTIFICATION_TYPES } from './notification.types.js';

const CLINIC_BATCH = 100;
const ROW_BATCH = 100;

export class NotificationConditionService {
  private running = false;

  constructor(
    private readonly clinics: ClinicRepository = clinicRepository,
    private readonly continuity: CareContinuityService = careContinuityService,
    private readonly events: CommunicationEventService = communicationEventService,
  ) {}

  async sweep(log: FastifyBaseLogger, now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let emitted = 0;
    try {
      let afterId: string | null = null;
      while (true) {
        const clinics = await this.clinics.listActiveAfter(afterId, CLINIC_BATCH);
        if (clinics.length === 0) break;
        for (const clinic of clinics) {
          emitted += await this.sweepClinic(clinic._id.toString(), now);
        }
        afterId = clinics.at(-1)!._id.toString();
        if (clinics.length < CLINIC_BATCH) break;
      }
      return emitted;
    } catch (error) {
      log.error({ err: error }, 'Care-continuity notification sweep failed');
      return emitted;
    } finally {
      this.running = false;
    }
  }

  private async sweepClinic(clinicId: string, now: Date): Promise<number> {
    let page = 1;
    let emitted = 0;
    while (true) {
      const result = await this.continuity.list(clinicId, {}, { page, limit: ROW_BATCH }, now);
      for (const row of result.rows) {
        const contextId = row.context.retentionPlanId ?? row.context.treatment.id;
        const anchor = [
          row.lastClinicalAt,
          row.recommendedAt ?? '',
          row.missedAppointment?.id ?? '',
        ].join(':');
        await this.events.enqueue({
          clinicId,
          type: NOTIFICATION_TYPES.CARE_CONTINUITY_ATTENTION,
          aggregateType: row.context.type === 'RETENTION' ? 'RETENTION_PLAN' : 'TREATMENT',
          aggregateId: contextId,
          actorUserId: null,
          deduplicationKey: `CARE_CONTINUITY:${row.patient.id}:${row.context.type}:${contextId}:${anchor}`,
          payload: {
            patientId: row.patient.id,
            patientName: row.patient.fullName,
            treatmentId: row.context.treatment.id,
            retentionPlanId: row.context.retentionPlanId,
            reasons: [...row.reasons].sort(),
            state: row.state,
            cycleAnchor: anchor,
          },
          occurredAt: now,
        });
        emitted += 1;
      }
      if (result.rows.length < ROW_BATCH) break;
      page += 1;
    }
    return emitted;
  }
}

export const notificationConditionService = new NotificationConditionService();

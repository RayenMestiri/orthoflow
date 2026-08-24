import type { FastifyBaseLogger } from 'fastify';
import { AppointmentModel } from '../appointments/appointment.model.js';
import { communicationEventService } from '../notifications/notification.service.js';
import { EXTERNAL_EVENT_TYPES } from './communication.types.js';

/** Reconciles legacy/missed appointment events; normal scheduling remains event-driven. */
export class AppointmentReminderScheduler {
  private running = false;
  async sweep(log: FastifyBaseLogger): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const now = new Date();
      const appointments = await AppointmentModel.find(
        {
          status: { $in: ['SCHEDULED', 'CONFIRMED'] },
          startAt: { $gt: now, $lte: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000) },
        },
        { clinicId: 1, patientId: 1, startAt: 1, updatedAt: 1 },
      )
        .sort({ startAt: 1 })
        .limit(500)
        .lean()
        .exec();
      for (const appointment of appointments) {
        await communicationEventService.enqueue({
          clinicId: appointment.clinicId.toString(),
          type: EXTERNAL_EVENT_TYPES.APPOINTMENT_SCHEDULED,
          aggregateType: 'APPOINTMENT',
          aggregateId: appointment._id.toString(),
          actorUserId: null,
          deduplicationKey: `APPOINTMENT_SCHEDULED:${appointment._id.toString()}:${appointment.startAt.toISOString()}`,
          payload: {
            patientId: appointment.patientId.toString(),
            startAt: appointment.startAt.toISOString(),
          },
          occurredAt: appointment.updatedAt,
        });
      }
      return appointments.length;
    } catch (error) {
      log.error({ err: error }, 'Appointment reminder reconciliation failed');
      return 0;
    } finally {
      this.running = false;
    }
  }
}

export const appointmentReminderScheduler = new AppointmentReminderScheduler();

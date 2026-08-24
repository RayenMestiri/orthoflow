import { hostname } from 'node:os';
import type { FastifyBaseLogger } from 'fastify';
import { AppointmentModel } from '../appointments/appointment.model.js';
import { secretEnvelopeService } from '../../infrastructure/security/secret-envelope.service.js';
import { channelAdapterRegistry } from './channel-adapters.js';
import {
  communicationRepository,
  type CommunicationRepository,
} from './communication.repository.js';
import { renderCommunication } from './communication.templates.js';
import { ChannelDeliveryError, TEMPLATE_KEYS } from './communication.types.js';

const LEASE_MS = 120_000;
const MAX_BATCH = 25;

export class CommunicationWorker {
  private readonly workerId = `${hostname()}:${process.pid}:external`;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private drainResolvers: Array<() => void> = [];
  constructor(private readonly jobs: CommunicationRepository = communicationRepository) {}

  start(intervalMs: number, log: FastifyBaseLogger): void {
    if (this.timer) return;
    const run = () =>
      void this.runOnce(log).catch((error: unknown) =>
        log.error({ err: error }, 'Communication worker batch failed'),
      );
    run();
    this.timer = setInterval(run, intervalMs);
    this.timer.unref();
  }
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.running) {
      await new Promise<void>((resolve) => this.drainResolvers.push(resolve));
    }
  }

  async runOnce(log: FastifyBaseLogger): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let processed = 0;
    try {
      await this.jobs.cancelExpired(new Date());
      for (let index = 0; index < MAX_BATCH; index += 1) {
        const job = await this.jobs.claimNext(this.workerId, new Date(), LEASE_MS);
        if (!job) break;
        try {
          if (!(await this.isCurrent(job))) {
            await this.jobs.cancelPendingForAppointment(
              job.clinicId.toString(),
              job.appointmentId!.toString(),
              'STALE_APPOINTMENT_STATE',
            );
            continue;
          }
          const renderPayload = { ...job.payloadSnapshot };
          if (renderPayload.portalUrlEncrypted) {
            renderPayload.portalUrl = secretEnvelopeService.open(renderPayload.portalUrlEncrypted);
            delete renderPayload.portalUrlEncrypted;
          }
          const rendered = renderCommunication(job.templateKey, job.locale, renderPayload);
          const result = await channelAdapterRegistry.get(job.channel).send({
            destination: job.destinationSnapshot,
            subject: job.channel === 'EMAIL' ? rendered.subject : null,
            text: rendered.text,
            html: job.channel === 'EMAIL' ? rendered.html : null,
            idempotencyKey: job.deduplicationKey,
          });
          await this.jobs.markSent(
            job._id.toString(),
            this.workerId,
            result.providerMessageId,
            result.acceptedAt,
          );
          processed += 1;
        } catch (error) {
          const normalized =
            error instanceof ChannelDeliveryError
              ? error
              : new ChannelDeliveryError(
                  'Unexpected provider failure',
                  'PROVIDER_TEMPORARY_FAILURE',
                  false,
                );
          await this.jobs.markDeliveryFailure(
            job._id.toString(),
            this.workerId,
            normalized.code,
            normalized.permanent,
            job.attemptCount,
            new Date(),
          );
          log.error(
            { err: error, communicationJobId: job._id.toString(), channel: job.channel },
            'External communication delivery failed',
          );
        }
      }
      return processed;
    } finally {
      this.running = false;
      for (const resolve of this.drainResolvers.splice(0)) resolve();
    }
  }

  private async isCurrent(
    job: Awaited<ReturnType<CommunicationRepository['claimNext']>>,
  ): Promise<boolean> {
    if (!job || job.templateKey !== TEMPLATE_KEYS.APPOINTMENT_REMINDER || !job.appointmentId)
      return true;
    const appointment = await AppointmentModel.findOne(
      {
        _id: job.appointmentId,
        clinicId: job.clinicId,
        status: { $in: ['SCHEDULED', 'CONFIRMED'] },
      },
      { startAt: 1 },
    )
      .lean()
      .exec();
    return Boolean(
      appointment && appointment.startAt.toISOString() === job.payloadSnapshot.appointmentStartAt,
    );
  }
}

export const communicationWorker = new CommunicationWorker();

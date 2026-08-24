import { hostname } from 'node:os';
import type { FastifyBaseLogger } from 'fastify';
import {
  communicationOutboxRepository,
  type CommunicationOutboxRepository,
} from './notification.repository.js';
import { notificationDispatcher, type NotificationDispatcher } from './notification.dispatcher.js';
import {
  externalCommunicationProjector,
  type ExternalCommunicationProjector,
} from '../communications/external-communication.projector.js';

const LEASE_MS = 60_000;
const MAX_BATCH = 50;

export class NotificationWorker {
  private readonly workerId = `${hostname()}:${process.pid}`;
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeRun: Promise<number> | null = null;

  constructor(
    private readonly outbox: CommunicationOutboxRepository = communicationOutboxRepository,
    private readonly dispatcher: NotificationDispatcher = notificationDispatcher,
    private readonly externalProjector: ExternalCommunicationProjector = externalCommunicationProjector,
  ) {}

  start(intervalMs: number, log: FastifyBaseLogger): void {
    if (this.timer) return;
    const run = () =>
      void this.runOnce(log).catch((error: unknown) =>
        log.error({ err: error }, 'Notification worker batch failed'),
      );
    run();
    this.timer = setInterval(run, intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.activeRun) await this.activeRun;
  }

  runOnce(log: FastifyBaseLogger): Promise<number> {
    if (this.activeRun) return Promise.resolve(0);
    const run = this.processBatch(log);
    this.activeRun = run;
    void run.then(
      () => {
        if (this.activeRun === run) this.activeRun = null;
      },
      () => {
        if (this.activeRun === run) this.activeRun = null;
      },
    );
    return run;
  }

  private async processBatch(log: FastifyBaseLogger): Promise<number> {
    let processed = 0;
    for (let index = 0; index < MAX_BATCH; index += 1) {
      const event = await this.outbox.claimNext(this.workerId, new Date(), LEASE_MS);
      if (!event) break;
      try {
        await this.dispatcher.dispatch(event);
        await this.externalProjector.dispatch(event);
        await this.outbox.markProcessed(event.eventId, this.workerId, new Date());
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown notification error';
        await this.outbox.markFailed(
          event.eventId,
          this.workerId,
          event.attempts,
          message,
          new Date(),
        );
        log.error({ err: error, eventId: event.eventId }, 'Notification event dispatch failed');
      }
    }
    return processed;
  }
}

export const notificationWorker = new NotificationWorker();

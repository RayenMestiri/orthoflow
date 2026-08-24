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
  private running = false;

  constructor(
    private readonly outbox: CommunicationOutboxRepository = communicationOutboxRepository,
    private readonly dispatcher: NotificationDispatcher = notificationDispatcher,
    private readonly externalProjector: ExternalCommunicationProjector = externalCommunicationProjector,
  ) {}

  start(intervalMs: number, log: FastifyBaseLogger): void {
    if (this.timer) return;
    void this.runOnce(log);
    this.timer = setInterval(() => void this.runOnce(log), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(log: FastifyBaseLogger): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let processed = 0;
    try {
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
    } finally {
      this.running = false;
    }
  }
}

export const notificationWorker = new NotificationWorker();

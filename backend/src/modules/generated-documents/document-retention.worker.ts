import type { FastifyBaseLogger } from 'fastify';
import {
  documentRetentionService,
  type DocumentRetentionService,
} from './document-retention.service.js';

export class DocumentRetentionWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeRun: Promise<number> | null = null;

  constructor(
    private readonly service: DocumentRetentionService = documentRetentionService,
  ) {}

  start(intervalMs: number, log: FastifyBaseLogger): void {
    if (this.timer) return;
    const run = () =>
      void this.runOnce(log).catch((error: unknown) =>
        log.error({ err: error }, 'Document retention worker sweep failed'),
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
    const run = this.service.sweep(log);
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
}

export const documentRetentionWorker = new DocumentRetentionWorker();

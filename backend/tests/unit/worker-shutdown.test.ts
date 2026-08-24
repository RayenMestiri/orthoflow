import { describe, expect, it, vi } from 'vitest';
import { CommunicationWorker } from '../../src/modules/communications/communication.worker.js';
import { NotificationWorker } from '../../src/modules/notifications/notification.worker.js';

const logger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
} as never;

describe('worker shutdown', () => {
  it('waits for an active notification batch before stopping', async () => {
    let release: (() => void) | undefined;
    const outbox = {
      claimNext: vi.fn(
        () =>
          new Promise<null>((resolve) => {
            release = () => resolve(null);
          }),
      ),
    };
    const worker = new NotificationWorker(outbox as never, {} as never, {} as never);
    const running = worker.runOnce(logger);
    await vi.waitFor(() => expect(outbox.claimNext).toHaveBeenCalledOnce());

    let stopped = false;
    const stopping = worker.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release?.();
    await Promise.all([running, stopping]);
    expect(stopped).toBe(true);
  });

  it('waits for an active external communication batch before stopping', async () => {
    let release: (() => void) | undefined;
    const jobs = {
      cancelExpired: vi.fn(async () => undefined),
      claimNext: vi.fn(
        () =>
          new Promise<null>((resolve) => {
            release = () => resolve(null);
          }),
      ),
    };
    const worker = new CommunicationWorker(jobs as never);
    const running = worker.runOnce(logger);
    await vi.waitFor(() => expect(jobs.claimNext).toHaveBeenCalledOnce());

    let stopped = false;
    const stopping = worker.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release?.();
    await Promise.all([running, stopping]);
    expect(stopped).toBe(true);
  });
});

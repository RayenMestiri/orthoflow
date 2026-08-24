import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { notificationWorker } from '../modules/notifications/notification.worker.js';
import { notificationConditionService } from '../modules/notifications/notification-condition.service.js';

export const notificationWorkerPlugin = fp(
  async (app) => {
    if (!env.NOTIFICATION_WORKER_ENABLED) return;
    let conditionTimer: ReturnType<typeof setInterval> | null = null;

    app.addHook('onReady', async () => {
      notificationWorker.start(env.NOTIFICATION_WORKER_INTERVAL_MS, app.log);
      void notificationConditionService.sweep(app.log);
      conditionTimer = setInterval(
        () => void notificationConditionService.sweep(app.log),
        env.NOTIFICATION_CONDITION_SWEEP_INTERVAL_MS,
      );
      conditionTimer.unref();
    });
    app.addHook('onClose', async () => {
      notificationWorker.stop();
      if (conditionTimer) clearInterval(conditionTimer);
      conditionTimer = null;
    });
  },
  { name: 'notification-worker-plugin', dependencies: ['database-plugin'] },
);

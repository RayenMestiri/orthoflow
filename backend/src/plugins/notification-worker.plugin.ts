import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { notificationWorker } from '../modules/notifications/notification.worker.js';
import { notificationConditionService } from '../modules/notifications/notification-condition.service.js';
import { communicationWorker } from '../modules/communications/communication.worker.js';
import { appointmentReminderScheduler } from '../modules/communications/appointment-reminder.scheduler.js';

export const notificationWorkerPlugin = fp(
  async (app) => {
    if (!env.NOTIFICATION_WORKER_ENABLED && !env.COMMUNICATION_WORKER_ENABLED) return;
    let conditionTimer: ReturnType<typeof setInterval> | null = null;
    let reminderTimer: ReturnType<typeof setInterval> | null = null;

    app.addHook('onReady', async () => {
      if (env.NOTIFICATION_WORKER_ENABLED) {
        notificationWorker.start(env.NOTIFICATION_WORKER_INTERVAL_MS, app.log);
      }
      if (env.COMMUNICATION_WORKER_ENABLED) {
        communicationWorker.start(env.COMMUNICATION_WORKER_INTERVAL_MS, app.log);
        void appointmentReminderScheduler.sweep(app.log);
        reminderTimer = setInterval(
          () => void appointmentReminderScheduler.sweep(app.log),
          env.COMMUNICATION_REMINDER_SWEEP_INTERVAL_MS,
        );
        reminderTimer.unref();
      }
      if (env.NOTIFICATION_WORKER_ENABLED) {
        void notificationConditionService.sweep(app.log);
        conditionTimer = setInterval(
          () => void notificationConditionService.sweep(app.log),
          env.NOTIFICATION_CONDITION_SWEEP_INTERVAL_MS,
        );
        conditionTimer.unref();
      }
    });
    app.addHook('onClose', async () => {
      notificationWorker.stop();
      communicationWorker.stop();
      if (conditionTimer) clearInterval(conditionTimer);
      conditionTimer = null;
      if (reminderTimer) clearInterval(reminderTimer);
      reminderTimer = null;
    });
  },
  { name: 'notification-worker-plugin', dependencies: ['database-plugin'] },
);

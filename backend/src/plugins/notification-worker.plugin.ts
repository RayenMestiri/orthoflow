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
    let conditionRun: Promise<unknown> | null = null;
    let reminderRun: Promise<unknown> | null = null;

    const sweepConditions = (): void => {
      if (conditionRun) return;
      const run = notificationConditionService.sweep(app.log);
      conditionRun = run;
      void run.then(
        () => {
          if (conditionRun === run) conditionRun = null;
        },
        (error: unknown) => {
          app.log.error({ err: error }, 'Notification condition sweep failed');
          if (conditionRun === run) conditionRun = null;
        },
      );
    };
    const sweepReminders = (): void => {
      if (reminderRun) return;
      const run = appointmentReminderScheduler.sweep(app.log);
      reminderRun = run;
      void run.then(
        () => {
          if (reminderRun === run) reminderRun = null;
        },
        (error: unknown) => {
          app.log.error({ err: error }, 'Appointment reminder sweep failed');
          if (reminderRun === run) reminderRun = null;
        },
      );
    };

    app.addHook('onReady', async () => {
      if (env.NOTIFICATION_WORKER_ENABLED) {
        notificationWorker.start(env.NOTIFICATION_WORKER_INTERVAL_MS, app.log);
      }
      if (env.COMMUNICATION_WORKER_ENABLED) {
        communicationWorker.start(env.COMMUNICATION_WORKER_INTERVAL_MS, app.log);
        sweepReminders();
        reminderTimer = setInterval(sweepReminders, env.COMMUNICATION_REMINDER_SWEEP_INTERVAL_MS);
        reminderTimer.unref();
      }
      if (env.NOTIFICATION_WORKER_ENABLED) {
        sweepConditions();
        conditionTimer = setInterval(sweepConditions, env.NOTIFICATION_CONDITION_SWEEP_INTERVAL_MS);
        conditionTimer.unref();
      }
    });
    app.addHook('onClose', async () => {
      if (conditionTimer) clearInterval(conditionTimer);
      conditionTimer = null;
      if (reminderTimer) clearInterval(reminderTimer);
      reminderTimer = null;
      await Promise.all([
        notificationWorker.stop(),
        communicationWorker.stop(),
        conditionRun ?? Promise.resolve(),
        reminderRun ?? Promise.resolve(),
      ]);
    });
  },
  { name: 'notification-worker-plugin', dependencies: ['database-plugin'] },
);

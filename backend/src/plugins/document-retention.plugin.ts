import fp from 'fastify-plugin';
import { documentRetentionWorker } from '../modules/generated-documents/document-retention.worker.js';

/** Default sweep interval: 1 hour (3,600,000 ms) */
const DEFAULT_RETENTION_SWEEP_INTERVAL_MS = 3_600_000;

export const documentRetentionPlugin = fp(
  async (app) => {
    app.addHook('onReady', async () => {
      documentRetentionWorker.start(DEFAULT_RETENTION_SWEEP_INTERVAL_MS, app.log);
    });

    app.addHook('onClose', async () => {
      await documentRetentionWorker.stop();
    });
  },
  { name: 'document-retention-plugin', dependencies: ['database-plugin'] },
);

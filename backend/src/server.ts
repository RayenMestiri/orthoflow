import { buildApp } from './app.js';
import { env, isSwaggerEnabled } from './config/env.js';
import { logger } from './config/logger.js';

/**
 * Process entry point: boot the app, listen, and shut down cleanly.
 *
 * Graceful shutdown matters here — an in-flight request may be halfway through
 * writing a cash record and its audit entry, and killing the process between
 * the two is exactly the inconsistency OrthoFlow exists to avoid.
 */
async function start(): Promise<void> {
  const app = await buildApp();

  const shutdown = (signal: NodeJS.Signals): void => {
    app.log.info({ signal }, 'Shutting down');
    void app
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        app.log.error({ err: error }, 'Error during shutdown');
        process.exit(1);
      });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.on('unhandledRejection', (reason: unknown) => {
    app.log.fatal({ err: reason }, 'Unhandled promise rejection');
    process.exit(1);
  });

  process.on('uncaughtException', (error: Error) => {
    app.log.fatal({ err: error }, 'Uncaught exception');
    process.exit(1);
  });

  await app.listen({ port: env.PORT, host: env.HOST });

  app.log.info(
    {
      environment: env.NODE_ENV,
      docs: isSwaggerEnabled ? `http://localhost:${env.PORT}/docs` : 'disabled',
    },
    'OrthoFlow API is ready',
  );
}

start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start OrthoFlow API');
  process.exit(1);
});

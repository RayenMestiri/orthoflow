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
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals, exitCode = 0): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Shutting down');
    const forceExit = setTimeout(() => {
      app.log.fatal({ graceMs: env.SHUTDOWN_GRACE_MS }, 'Graceful shutdown timed out');
      process.exit(1);
    }, env.SHUTDOWN_GRACE_MS);
    forceExit.unref();
    try {
      await app.close();
      clearTimeout(forceExit);
      process.exit(exitCode);
    } catch (error) {
      clearTimeout(forceExit);
      app.log.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason: unknown) => {
    app.log.fatal({ err: reason }, 'Unhandled promise rejection');
    void shutdown('SIGTERM', 1);
  });

  process.on('uncaughtException', (error: Error) => {
    app.log.fatal({ err: error }, 'Uncaught exception');
    void shutdown('SIGTERM', 1);
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

import fp from 'fastify-plugin';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database/connection.js';

/**
 * Owns the MongoDB connection lifecycle for the HTTP process.
 *
 * Connecting during boot (rather than lazily on first query) means a bad URI or
 * an IP-allowlist mistake fails the deploy instead of failing the first patient
 * lookup of the morning.
 */
export const databasePlugin = fp(
  async (app) => {
    await connectDatabase(app.log);

    app.addHook('onClose', async () => {
      await disconnectDatabase();
    });
  },
  { name: 'database-plugin' },
);

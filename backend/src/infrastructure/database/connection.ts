import mongoose from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import { databaseConfig, mongooseConnectOptions } from '../../config/database.js';

/**
 * Reject unknown operators in query filters and unknown paths in updates.
 * With `strictQuery` on, a typo'd field name fails loudly instead of silently
 * matching every document in a collection.
 */
mongoose.set('strictQuery', true);

/**
 * NOTE ON QUERY INJECTION
 * -----------------------
 * We deliberately do NOT enable `sanitizeFilter`, because it also rewrites the
 * legitimate operator objects our repositories build (`{ $gte: date }`).
 * Injection is prevented one layer earlier instead: every value that reaches a
 * filter has been through a Zod schema that only admits primitives, so a client
 * can never smuggle `{ "$ne": null }` into a query. See AGENTS.md.
 */

export type DatabaseState =
  'disconnected' | 'connected' | 'connecting' | 'disconnecting' | 'unknown';

const READY_STATES: Record<number, DatabaseState> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export function getDatabaseState(): DatabaseState {
  return READY_STATES[mongoose.connection.readyState] ?? 'unknown';
}

export function isDatabaseConnected(): boolean {
  return getDatabaseState() === 'connected';
}

let connecting: Promise<typeof mongoose> | null = null;

/** Idempotent connect — safe to call from both the server and seed scripts. */
export async function connectDatabase(logger?: FastifyBaseLogger): Promise<typeof mongoose> {
  if (isDatabaseConnected()) {
    return mongoose;
  }
  if (connecting) {
    return connecting;
  }

  mongoose.connection.on('error', (error: Error) => {
    logger?.error({ err: error }, 'MongoDB connection error');
  });
  mongoose.connection.on('disconnected', () => {
    logger?.warn('MongoDB disconnected');
  });
  mongoose.connection.on('reconnected', () => {
    logger?.info('MongoDB reconnected');
  });

  connecting = mongoose.connect(databaseConfig.uri, mongooseConnectOptions);

  try {
    await connecting;
    logger?.info({ database: databaseConfig.dbName }, 'MongoDB connected');
    return mongoose;
  } finally {
    connecting = null;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (getDatabaseState() === 'disconnected') {
    return;
  }
  await mongoose.disconnect();
}

/** Cheap liveness probe used by `GET /health`. */
export async function pingDatabase(): Promise<boolean> {
  if (!isDatabaseConnected() || !mongoose.connection.db) {
    return false;
  }
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

import type { ConnectOptions } from 'mongoose';
import { env, isProduction } from './env.js';

/**
 * Mongoose connection options, derived once from the validated environment.
 *
 * `autoIndex` is deliberately off in production: index builds are a deploy-time
 * operation (`npm run db:sync-indexes`), not something a booting API process
 * should trigger against a live cluster.
 */
export const mongooseConnectOptions: ConnectOptions = {
  dbName: env.MONGODB_DB_NAME,
  autoIndex: !isProduction,
  maxPoolSize: 30,
  minPoolSize: 10,
  maxIdleTimeMS: 60_000,
  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  retryWrites: true,
};

export const databaseConfig = {
  uri: env.MONGODB_URI,
  dbName: env.MONGODB_DB_NAME,
  /** Multi-document transactions need a replica set (MongoDB Atlas provides one). */
  transactionsEnabled: env.MONGODB_TRANSACTIONS_ENABLED,
} as const;

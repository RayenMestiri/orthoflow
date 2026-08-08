import mongoose, { type ClientSession } from 'mongoose';
import { databaseConfig } from '../../config/database.js';

/**
 * Runs `work` inside a MongoDB transaction when the deployment supports one.
 *
 * Registration creates a user, a clinic and an ownership membership — three
 * writes that must not half-apply, or a clinic ends up with no owner. On a
 * standalone mongod (no replica set) transactions are unavailable, so the work
 * runs without a session and the caller is responsible for compensating.
 */
export async function withTransaction<T>(
  work: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  if (!databaseConfig.transactionsEnabled) {
    return work(undefined);
  }

  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}

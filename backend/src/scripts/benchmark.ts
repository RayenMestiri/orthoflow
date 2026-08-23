import mongoose from 'mongoose';
import { databaseConfig } from '../config/database.js';

async function runPoolBenchmark() {
  console.log('--- TESTING minPoolSize: 10 with pre-warming ---');
  const connectStart = performance.now();
  await mongoose.connect(databaseConfig.uri, {
    dbName: databaseConfig.dbName,
    maxPoolSize: 30,
    minPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    retryWrites: true,
  });
  console.log(`Connected in ${(performance.now() - connectStart).toFixed(2)}ms`);

  const db = mongoose.connection.db!;

  // Warm up connections in pool
  console.log('Pre-warming 10 pool connections...');
  const warmStart = performance.now();
  await Promise.all(
    Array.from({ length: 10 }).map(() => db.admin().ping())
  );
  console.log(`Pre-warmed 10 connections in ${(performance.now() - warmStart).toFixed(2)}ms`);

  // Concurrency test on warm pool
  for (const concurrency of [1, 2, 5, 10, 15, 20]) {
    const t0 = performance.now();
    const tasks = Array.from({ length: concurrency }).map(() =>
      db.collection('appointmenttypes').find({}).toArray()
    );
    await Promise.all(tasks);
    const t1 = performance.now();
    console.log(`${concurrency} concurrent queries: ${(t1 - t0).toFixed(2)}ms (avg per query: ${((t1 - t0) / concurrency).toFixed(2)}ms)`);
  }

  // Auth parallel simulation on warm pool
  const user = await db.collection('users').findOne({});
  const userId = user?._id;
  const clinic = await db.collection('clinics').findOne({});
  const clinicId = clinic?._id;
  const session = await db.collection('sessions').findOne({ userId });
  const sessionId = session?._id;

  console.log('\n--- AUTH PARALLEL ON WARM POOL (5 concurrent auth requests) ---');
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: 5 }).map(async () => {
      const [u, s, m, c] = await Promise.all([
        db.collection('users').findOne({ _id: userId }),
        db.collection('sessions').findOne({ _id: sessionId }),
        db.collection('memberships').find({ userId, status: 'ACTIVE' }).toArray(),
        db.collection('clinics').findOne({ _id: clinicId }),
      ]);
      return { u, s, m, c };
    })
  );
  const t1 = performance.now();
  console.log(`5 concurrent auth requests (20 total queries): ${(t1 - t0).toFixed(2)}ms!`);

  await mongoose.disconnect();
}

runPoolBenchmark().catch(console.error);

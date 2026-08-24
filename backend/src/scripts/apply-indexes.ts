import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database/connection.js';
import '../modules/index.js';

async function main(): Promise<void> {
  if (!process.argv.includes('--apply')) {
    throw new Error('Refusing to modify indexes without --apply. Run this in staging first.');
  }

  await connectDatabase();
  const models = Object.values(mongoose.models);
  for (const model of models) {
    await model.createIndexes();
    console.warn(`Ensured indexes for ${model.collection.collectionName}`);
  }
  console.warn(
    `Index deployment complete for ${models.length} collections; no indexes were dropped.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Index deployment failed');
    process.exitCode = 1;
  })
  .finally(async () => disconnectDatabase());

import mongoose from 'mongoose';
import { env } from '../config/env.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('No DB connection');
    return;
  }
  const media = await db.collection('patientmedias').find({}).toArray();
  console.log(`Found ${media.length} media records in DB:`);
  for (const m of media) {
    console.log({
      id: m._id.toString(),
      title: m.title,
      publicId: m.publicId,
      secureUrl: m.secureUrl,
      deliveryType: m.deliveryType,
      resourceType: m.resourceType,
      storageProvider: m.storageProvider,
    });
  }
  await mongoose.disconnect();
}

main().catch(console.error);

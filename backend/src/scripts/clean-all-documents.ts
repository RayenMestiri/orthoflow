import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { mediaService } from '../infrastructure/cloudinary/media.service.js';

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('Failed to connect to database');
    return;
  }

  // 1. Clean Patient Media
  const mediaCount = await db.collection('patientmedias').countDocuments();
  console.log(`Found ${mediaCount} records in patientmedias collection.`);
  if (mediaCount > 0) {
    const allMedia = await db.collection('patientmedias').find({}).toArray();
    for (const m of allMedia) {
      if (m.publicId && mediaService.isEnabled()) {
        try {
          await mediaService.remove(m.publicId, m.resourceType ?? 'image');
          console.log(`Removed Cloudinary asset: ${m.publicId}`);
        } catch (err: unknown) {
          console.warn(`Could not remove Cloudinary asset ${m.publicId}:`, (err as Error).message);
        }
      }
    }
    await db.collection('patientmedias').deleteMany({});
    console.log('Deleted all records from patientmedias collection.');
  }

  // 2. Clean Generated Documents
  const genDocCount = await db.collection('generateddocuments').countDocuments();
  console.log(`Found ${genDocCount} records in generateddocuments collection.`);
  if (genDocCount > 0) {
    const allDocs = await db.collection('generateddocuments').find({}).toArray();
    for (const d of allDocs) {
      if (d.pdfPublicId && mediaService.isEnabled()) {
        try {
          await mediaService.remove(d.pdfPublicId, 'raw');
          console.log(`Removed Cloudinary PDF: ${d.pdfPublicId}`);
        } catch (err: unknown) {
          console.warn(`Could not remove Cloudinary PDF ${d.pdfPublicId}:`, (err as Error).message);
        }
      }
    }
    await db.collection('generateddocuments').deleteMany({});
    console.log('Deleted all records from generateddocuments collection.');
  }

  console.log('\nAll documents and media successfully cleaned.');
  await mongoose.disconnect();
}

main().catch(console.error);

import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { mediaService } from '../infrastructure/cloudinary/media.service.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) {
    console.log('No DB');
    return;
  }
  const media = await db.collection('patientmedias').find({}).toArray();
  console.log('Found media records in patientmedias:', media.length);
  for (const m of media) {
    const url = mediaService.createPrivateDownloadUrl(
      m.publicId,
      m.resourceType,
      m.deliveryType,
      m.format,
    );
    console.log('--------------------------------------------------');
    console.log('Record:', {
      id: m._id.toString(),
      title: m.title,
      category: m.category,
      publicId: m.publicId,
      resourceType: m.resourceType,
      deliveryType: m.deliveryType,
      format: m.format,
      mediaType: m.mediaType,
      secureUrl: m.secureUrl,
      generatedUrl: url,
    });
    try {
      const res = await fetch(url);
      console.log('Fetch generatedUrl HTTP status:', res.status, res.statusText);
      if (!res.ok) {
        const text = await res.text();
        console.log('Error body:', text.slice(0, 300));
      }
    } catch (err: unknown) {
      console.log('Fetch error:', (err as Error).message);
    }
  }

  // Also check generated documents
  const docs = await db.collection('generateddocuments').find({}).toArray();
  console.log('\nFound generated documents:', docs.length);
  for (const d of docs) {
    if (d.mediaId) {
      console.log('GenDoc mediaId:', d.mediaId, 'title:', d.title);
    }
    if (d.pdfPublicId) {
      const url = mediaService.createPrivateDownloadUrl(
        d.pdfPublicId,
        'raw',
        'authenticated',
        'pdf',
      );
      console.log('GenDoc pdfPublicId url:', url);
      try {
        const res = await fetch(url);
        console.log('Fetch GenDoc HTTP status:', res.status, res.statusText);
      } catch (err: unknown) {
        console.log('Fetch error:', (err as Error).message);
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);

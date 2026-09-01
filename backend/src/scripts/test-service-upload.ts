import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { patientMediaService } from '../modules/patient-media/patient-media.service.js';
import { CLINIC_ROLES } from '../common/constants/roles.js';
import { PATIENT_MEDIA_CATEGORIES, PATIENT_MEDIA_TYPES } from '../modules/patient-media/patient-media.types.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) return;

  const patient = await db.collection('patients').findOne({});
  if (!patient) {
    console.log('No patients found in DB.');
    return;
  }
  const clinicId = patient.clinicId.toString();
  const patientId = patient._id.toString();
  const userId = new Types.ObjectId().toString();

  console.log(`Found existing patient: ${patient.firstName} ${patient.lastName} (ID: ${patientId}, Clinic: ${clinicId})`);

  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9Qz8DAwMTAwAAAEAEDAUivjTIAAAAASUVORK5CYII=',
    'base64',
  );

  console.log('Testing upload through patientMediaService...');
  const uploaded = await patientMediaService.upload(
    clinicId,
    patientId,
    {
      content: pngBuffer,
      originalFileName: 'test-upload.png',
      mimeType: 'image/png',
      mediaType: PATIENT_MEDIA_TYPES.IMAGE,
    },
    {
      category: PATIENT_MEDIA_CATEGORIES.EXTRAORAL_PHOTO,
      title: 'Test Photo Live',
    },
    {
      actorUserId: userId,
      clinicRole: CLINIC_ROLES.ORTHODONTIST,
      ip: '127.0.0.1',
      userAgent: 'test',
    },
  );

  console.log('\n--- Uploaded DTO Result ---');
  console.log({
    id: uploaded.id,
    title: uploaded.title,
    mediaType: uploaded.mediaType,
    contentUrl: uploaded.contentUrl,
  });

  console.log('\n--- Listing media for patient ---');
  const list = await patientMediaService.listForPatient(
    clinicId,
    patientId,
    {},
    { page: 1, limit: 10, skip: 0 },
  );
  console.log('Listed items count:', list.items.length);
  for (const item of list.items) {
    console.log({
      id: item.id,
      title: item.title,
      contentUrl: item.contentUrl,
    });
  }

  // Cleanup
  console.log('\nCleaning test upload...');
  await patientMediaService.archive(clinicId, uploaded.id, 'cleanup', {
    actorUserId: userId,
    clinicRole: CLINIC_ROLES.ORTHODONTIST,
    ip: '127.0.0.1',
    userAgent: 'test',
  });
  await db.collection('patientmedias').deleteMany({ _id: new Types.ObjectId(uploaded.id) });

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(console.error);

import { mediaService, MEDIA_SCOPES } from '../infrastructure/cloudinary/media.service.js';

async function main() {
  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9Qz8DAwMTAwAAAEAEDAUivjTIAAAAASUVORK5CYII=',
    'base64',
  );

  console.log('1. Uploading authenticated image...');
  const res = await mediaService.upload({
    clinicId: '65f0a0000000000000000001',
    scope: MEDIA_SCOPES.PATIENT_DOCUMENTS,
    subfolders: ['65f0a0000000000000000002'],
    content: pngBuffer,
    fileName: 'my-photo.png',
    mimeType: 'image/png',
    deliveryType: 'authenticated',
  });

  console.log('Upload secureUrl:', res.secureUrl);

  const fetchRes = await fetch(res.secureUrl);
  console.log('Fetch secureUrl status:', fetchRes.status, fetchRes.statusText);

  // Clean up
  await mediaService.remove(res.publicId, 'image');
  console.log('Cleanup complete.');
}

main().catch(console.error);

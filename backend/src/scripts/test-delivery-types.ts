import { getCloudinary } from '../config/cloudinary.js';
import { mediaService, MEDIA_SCOPES } from '../infrastructure/cloudinary/media.service.js';

async function main() {
  const cloudinary = getCloudinary();
  console.log('Cloudinary config:', {
    cloud_name: cloudinary.config().cloud_name,
    api_key: cloudinary.config().api_key ? 'configured' : 'missing',
  });

  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9Qz8DAwMTAwAAAEAEDAUivjTIAAAAASUVORK5CYII=',
    'base64',
  );

  // Test 1: Upload as 'upload' (standard delivery)
  console.log('\n--- 1. Testing upload as deliveryType="upload" ---');
  const uploadResult = await mediaService.upload({
    clinicId: 'testclinic',
    scope: MEDIA_SCOPES.PATIENT_DOCUMENTS,
    subfolders: ['testpatient'],
    content: pngBuffer,
    fileName: 'test-standard.png',
    mimeType: 'image/png',
    deliveryType: 'upload',
  });
  console.log('Upload result:', {
    publicId: uploadResult.publicId,
    secureUrl: uploadResult.secureUrl,
  });
  const url1 = mediaService.createPrivateDownloadUrl(
    uploadResult.publicId,
    uploadResult.resourceType,
    'upload',
    uploadResult.format,
  );
  console.log('Generated URL (upload):', url1);
  const res1 = await fetch(url1);
  console.log('Fetch URL (upload) Status:', res1.status, res1.statusText);
  if (!res1.ok) console.log('Body:', await res1.text());

  // Test 2: Upload as 'authenticated' (restricted delivery)
  console.log('\n--- 2. Testing upload as deliveryType="authenticated" ---');
  const authResult = await mediaService.upload({
    clinicId: 'testclinic',
    scope: MEDIA_SCOPES.PATIENT_DOCUMENTS,
    subfolders: ['testpatient'],
    content: pngBuffer,
    fileName: 'test-auth.png',
    mimeType: 'image/png',
    deliveryType: 'authenticated',
  });
  console.log('Auth result:', {
    publicId: authResult.publicId,
    secureUrl: authResult.secureUrl,
  });
  const url2 = mediaService.createPrivateDownloadUrl(
    authResult.publicId,
    authResult.resourceType,
    'authenticated',
    authResult.format,
  );
  console.log('Generated URL (authenticated):', url2);
  const res2 = await fetch(url2);
  console.log('Fetch URL (authenticated) Status:', res2.status, res2.statusText);
  if (!res2.ok) console.log('Body:', await res2.text());

  // Test 3: Direct secure_url from Cloudinary response
  console.log('\n--- 3. Testing direct secure_url ---');
  console.log('Auth secure_url:', authResult.secureUrl);
  const res3 = await fetch(authResult.secureUrl);
  console.log('Fetch auth secure_url Status:', res3.status, res3.statusText);
  if (!res3.ok) console.log('Body:', await res3.text());

  // Clean up
  await mediaService.remove(uploadResult.publicId, 'image');
  await mediaService.remove(authResult.publicId, 'image');
  console.log('\nCleanup complete.');
}

main().catch(console.error);

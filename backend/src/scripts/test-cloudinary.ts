import { mediaService, MEDIA_SCOPES } from '../infrastructure/cloudinary/media.service.js';

async function main() {
  console.log('Testing Cloudinary upload & download...');
  const clinicId = '65f0a0000000000000000001';
  const patientId = '65f0a0000000000000000002';

  // 1. Test PNG Image
  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  console.log('\n--- Testing PNG Image ---');
  const uploadedImage = await mediaService.upload({
    clinicId,
    scope: MEDIA_SCOPES.PATIENT_DOCUMENTS,
    subfolders: [patientId],
    content: pngBuffer,
    fileName: 'test-image.png',
    mimeType: 'image/png',
    deliveryType: 'authenticated',
  });
  console.log('Uploaded image:', uploadedImage.publicId);

  const imgDownloadUrl = mediaService.createPrivateDownloadUrl(
    uploadedImage.publicId,
    uploadedImage.resourceType,
    uploadedImage.deliveryType ?? 'authenticated',
    uploadedImage.format,
  );
  console.log('Signed Image CDN URL:', imgDownloadUrl);
  const imgRes = await fetch(imgDownloadUrl);
  console.log('CDN URL status:', imgRes.status, imgRes.statusText);

  const downloadedImgBuffer = await mediaService.download(
    uploadedImage.publicId,
    uploadedImage.resourceType,
    uploadedImage.deliveryType ?? 'authenticated',
    uploadedImage.format,
  );
  console.log('Server-side download buffer length:', downloadedImgBuffer.length);

  // 2. Test PDF Document
  const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 300 144]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000018 00000 n\n0000000067 00000 n\n0000000122 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n200\n%%EOF', 'utf-8');

  console.log('\n--- Testing PDF Document ---');
  const uploadedPdf = await mediaService.upload({
    clinicId,
    scope: MEDIA_SCOPES.PATIENT_DOCUMENTS,
    subfolders: [patientId],
    content: pdfBuffer,
    fileName: 'test-doc.pdf',
    mimeType: 'application/pdf',
    deliveryType: 'authenticated',
  });
  console.log('Uploaded PDF:', uploadedPdf.publicId);

  const pdfDownloadUrl = mediaService.createPrivateDownloadUrl(
    uploadedPdf.publicId,
    uploadedPdf.resourceType,
    uploadedPdf.deliveryType ?? 'authenticated',
    uploadedPdf.format,
  );
  console.log('Signed PDF Download URL:', pdfDownloadUrl);
  const pdfRes = await fetch(pdfDownloadUrl);
  console.log('PDF Download status:', pdfRes.status, pdfRes.statusText);

  const downloadedPdfBuffer = await mediaService.download(
    uploadedPdf.publicId,
    uploadedPdf.resourceType,
    uploadedPdf.deliveryType ?? 'authenticated',
    uploadedPdf.format,
  );
  console.log('Server-side download PDF buffer length:', downloadedPdfBuffer.length);

  // Cleanup
  console.log('\nCleaning up test assets...');
  await mediaService.remove(uploadedImage.publicId, uploadedImage.resourceType);
  await mediaService.remove(uploadedPdf.publicId, uploadedPdf.resourceType);
  console.log('All tests passed successfully!');
}

main().catch(console.error);

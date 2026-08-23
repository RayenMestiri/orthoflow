import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { ConsentPdfService } from '../../src/modules/consents/consent-pdf.service.js';

function signature(): Buffer {
  const image = new PNG({ width: 320, height: 140, colorType: 6 });
  image.data.fill(255);
  for (let pixel = 0; pixel < 80; pixel += 1) {
    const index = ((70 + (pixel % 3)) * image.width + 40 + pixel) * 4;
    image.data[index] = 20;
    image.data[index + 1] = 45;
    image.data[index + 2] = 65;
    image.data[index + 3] = 255;
  }
  return PNG.sync.write(image);
}

describe('ConsentPdfService', () => {
  it('renders a finalized server-side PDF with the captured signature', async () => {
    const result = await new ConsentPdfService().generate({
      clinicName: 'OrthoFlow Clinic',
      clinicAddress: '12 Main Street',
      clinicPhone: '+213 555 0100',
      consentRef: 'CNS-2026-000001',
      title: 'Orthodontic treatment consent',
      templateVersion: 3,
      patientName: 'Nadia Patient',
      signerName: 'Karim Guardian',
      signerRelationship: 'Father',
      presentedByName: 'Dr Aymen',
      signedAtLabel: '23 August 2026 at 10:15',
      content: 'Clinic-approved consent content captured as an immutable snapshot.',
      signaturePng: signature(),
    });
    expect(result.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.byteLength).toBeGreaterThan(3_000);
  });
});

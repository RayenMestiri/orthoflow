import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  assertSafeConsentTemplate,
  renderConsentTemplate,
  type ConsentPlaceholderValues,
} from '../../src/modules/consents/consent-placeholders.js';
import { validateConsentSignature } from '../../src/modules/consents/consent.validation.js';

function signaturePng(withInk: boolean): Buffer {
  const image = new PNG({ width: 320, height: 140, colorType: 6 });
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = 255;
    image.data[index + 1] = 255;
    image.data[index + 2] = 255;
    image.data[index + 3] = 255;
  }
  if (withInk) {
    for (let pixel = 0; pixel < 80; pixel += 1) {
      const x = 40 + pixel;
      const y = 70 + Math.round(Math.sin(pixel / 8) * 12);
      const index = (y * image.width + x) * 4;
      image.data[index] = 20;
      image.data[index + 1] = 45;
      image.data[index + 2] = 65;
    }
  }
  return PNG.sync.write(image);
}

describe('consent evidence validation', () => {
  it('accepts a decodable PNG containing visible signature ink', () => {
    const result = validateConsentSignature(signaturePng(true), 'signature.png', 'image/png');
    expect(result).toMatchObject({ width: 320, height: 140, mimeType: 'image/png' });
  });

  it('rejects a blank canvas and MIME-spoofed data', () => {
    expect(() => validateConsentSignature(signaturePng(false), 'blank.png', 'image/png')).toThrow(
      'Draw a signature',
    );
    expect(() =>
      validateConsentSignature(Buffer.from('not a png'), 'signature.png', 'image/png'),
    ).toThrow('valid PNG');
  });

  it('renders only strict allowlisted placeholders', () => {
    const values: ConsentPlaceholderValues = {
      'patient.fullName': 'Samira Patient',
      'guardian.fullName': 'Karim Guardian',
      'signer.fullName': 'Karim Guardian',
      'clinic.name': 'OrthoFlow Clinic',
      'doctor.fullName': 'Dr Aymen',
      'treatment.label': 'Fixed appliance',
      date: '23 August 2026',
    };
    expect(renderConsentTemplate('Patient: {{ patient.fullName }}\nDate: {{date}}', values)).toBe(
      'Patient: Samira Patient\nDate: 23 August 2026',
    );
    expect(() => assertSafeConsentTemplate('Unsafe {{process.env.SECRET}}')).toThrow(
      'Unsupported consent placeholder',
    );
    expect(() => assertSafeConsentTemplate('Malformed {{ patient.fullName')).toThrow(
      'malformed placeholder',
    );
  });
});

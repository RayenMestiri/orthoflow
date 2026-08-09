import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { parsePatientMediaUpload } from '../../src/modules/patient-media/patient-media.validation.js';
import {
  PATIENT_MEDIA_CATEGORIES,
  PATIENT_MEDIA_IMAGE_LIMIT_BYTES,
  PATIENT_MEDIA_TYPES,
} from '../../src/modules/patient-media/patient-media.types.js';

function uploadRequest(options: {
  content: Buffer;
  mimeType: string;
  fileName?: string;
  fields?: Record<string, string>;
}): FastifyRequest {
  const fields = options.fields ?? {
    category: PATIENT_MEDIA_CATEGORIES.EXTRAORAL_PHOTO,
    title: 'Front view',
  };
  return {
    isMultipart: () => true,
    parts: async function* () {
      for (const [fieldname, value] of Object.entries(fields)) {
        yield { type: 'field' as const, fieldname, value };
      }
      yield {
        type: 'file' as const,
        filename: options.fileName ?? 'upload.bin',
        mimetype: options.mimeType,
        toBuffer: async () => options.content,
      };
    },
  } as unknown as FastifyRequest;
}

describe('patient media upload validation', () => {
  it('accepts a valid JPEG based on MIME and file signature', async () => {
    const result = await parsePatientMediaUpload(
      uploadRequest({ content: Buffer.from([0xff, 0xd8, 0xff, 0x00]), mimeType: 'image/jpeg' }),
    );
    expect(result.file.mediaType).toBe(PATIENT_MEDIA_TYPES.IMAGE);
    expect(result.metadata.category).toBe(PATIENT_MEDIA_CATEGORIES.EXTRAORAL_PHOTO);
  });

  it('accepts a valid PDF and preserves a separate capture date', async () => {
    const result = await parsePatientMediaUpload(
      uploadRequest({
        content: Buffer.from('%PDF-1.7\n'),
        mimeType: 'application/pdf',
        fields: {
          category: PATIENT_MEDIA_CATEGORIES.CONSENT,
          title: 'Consent form',
          capturedAt: '2026-08-01T12:00:00.000Z',
        },
      }),
    );
    expect(result.file.mediaType).toBe(PATIENT_MEDIA_TYPES.PDF);
    expect(result.metadata.capturedAt?.toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  it('rejects a spoofed JPEG whose bytes are not a JPEG', async () => {
    await expect(
      parsePatientMediaUpload(
        uploadRequest({ content: Buffer.from('not-an-image'), mimeType: 'image/jpeg' }),
      ),
    ).rejects.toThrow('Only valid JPEG, PNG, WebP and PDF files are supported');
  });

  it('rejects unsupported arbitrary documents', async () => {
    await expect(
      parsePatientMediaUpload(
        uploadRequest({ content: Buffer.from('plain text'), mimeType: 'text/plain' }),
      ),
    ).rejects.toThrow('Only valid JPEG, PNG, WebP and PDF files are supported');
  });

  it('enforces the smaller 10 MB image limit', async () => {
    const oversized = Buffer.alloc(PATIENT_MEDIA_IMAGE_LIMIT_BYTES + 1);
    oversized.set([0xff, 0xd8, 0xff], 0);
    await expect(
      parsePatientMediaUpload(uploadRequest({ content: oversized, mimeType: 'image/jpeg' })),
    ).rejects.toThrow('Images must not exceed 10 MB');
  });

  it('rejects missing files and invalid metadata', async () => {
    const request = {
      isMultipart: () => true,
      parts: async function* () {
        yield { type: 'field' as const, fieldname: 'title', value: '' };
      },
    } as unknown as FastifyRequest;
    await expect(parsePatientMediaUpload(request)).rejects.toThrow('Choose a file to upload');
  });
});

import type { FastifyRequest } from 'fastify';
import { PNG } from 'pngjs';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { ValidationError } from '../../common/errors/app-error.js';
import type { ConsentSignatureFile, ConsentSigningInput } from './consent.types.js';
import { consentSigningMetadataSchema } from './consent.schema.js';

export const CONSENT_SIGNATURE_MAX_BYTES = 1024 * 1024;
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export interface ParsedConsentSigningUpload {
  input: ConsentSigningInput;
  signature: ConsentSignatureFile;
}

export function validateConsentSignature(
  content: Buffer,
  originalFileName: string,
  mimeType: string,
): ConsentSignatureFile {
  if (
    mimeType !== 'image/png' ||
    content.length < PNG_MAGIC.length ||
    !content.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
  ) {
    throw new ValidationError('The signature must be a valid PNG image', {
      code: ERROR_CODES.INVALID_CONSENT_SIGNATURE,
    });
  }
  if (content.length > CONSENT_SIGNATURE_MAX_BYTES) {
    throw new ValidationError('The signature image must not exceed 1 MB', {
      code: ERROR_CODES.FILE_TOO_LARGE,
    });
  }

  let decoded: PNG;
  try {
    decoded = PNG.sync.read(content);
  } catch (error) {
    throw new ValidationError('The signature PNG could not be decoded', {
      code: ERROR_CODES.INVALID_CONSENT_SIGNATURE,
      cause: error,
    });
  }
  if (decoded.width < 240 || decoded.width > 4096 || decoded.height < 100 || decoded.height > 1600) {
    throw new ValidationError('The signature image dimensions are invalid', {
      code: ERROR_CODES.INVALID_CONSENT_SIGNATURE,
    });
  }

  let inkPixels = 0;
  for (let index = 0; index < decoded.data.length; index += 4) {
    const alpha = decoded.data[index + 3] ?? 0;
    const red = decoded.data[index] ?? 255;
    const green = decoded.data[index + 1] ?? 255;
    const blue = decoded.data[index + 2] ?? 255;
    if (alpha > 24 && red + green + blue < 690) inkPixels += 1;
    if (inkPixels >= 24) break;
  }
  if (inkPixels < 24) {
    throw new ValidationError('Draw a signature before finalizing the consent', {
      code: ERROR_CODES.EMPTY_CONSENT_SIGNATURE,
    });
  }

  return {
    content,
    originalFileName: originalFileName.slice(0, 255),
    mimeType: 'image/png',
    width: decoded.width,
    height: decoded.height,
  };
}

export async function parseConsentSigningUpload(
  request: FastifyRequest,
): Promise<ParsedConsentSigningUpload> {
  if (!request.isMultipart()) {
    throw new ValidationError('A multipart signature upload is required', {
      code: ERROR_CODES.INVALID_UPLOAD,
    });
  }
  const fields: Record<string, string> = {};
  let signature: ConsentSignatureFile | null = null;
  try {
    for await (const part of request.parts({
      limits: { fields: 8, files: 1, parts: 9, fieldSize: 25_000, fileSize: CONSENT_SIGNATURE_MAX_BYTES },
    })) {
      if (part.type === 'field') {
        if (typeof part.value === 'string') fields[part.fieldname] = part.value;
        continue;
      }
      if (signature) {
        throw new ValidationError('Only one signature file may be submitted', {
          code: ERROR_CODES.INVALID_UPLOAD,
        });
      }
      signature = validateConsentSignature(
        await part.toBuffer(),
        part.filename,
        part.mimetype,
      );
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('The signature upload is invalid or too large', {
      code: ERROR_CODES.INVALID_UPLOAD,
      cause: error,
    });
  }
  if (!signature) {
    throw new ValidationError('Draw a signature before finalizing the consent', {
      code: ERROR_CODES.EMPTY_CONSENT_SIGNATURE,
    });
  }
  const parsed = consentSigningMetadataSchema.safeParse({
    templateId: fields['templateId'],
    signerType: fields['signerType'],
    guardianId: fields['guardianId'] || null,
    treatmentId: fields['treatmentId'] || null,
    retentionPlanId: fields['retentionPlanId'] || null,
    idempotencyKey: fields['idempotencyKey'],
    acknowledgement: fields['acknowledgement'] === 'true',
  });
  if (!parsed.success) {
    throw new ValidationError('Consent signing metadata is invalid', {
      code: ERROR_CODES.VALIDATION_ERROR,
      details: parsed.error.flatten().fieldErrors,
    });
  }
  return { input: parsed.data, signature };
}

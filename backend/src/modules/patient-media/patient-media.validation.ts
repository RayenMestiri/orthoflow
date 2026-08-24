import type { FastifyRequest } from 'fastify';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { ValidationError } from '../../common/errors/app-error.js';
import { patientMediaUploadMetadataSchema } from './patient-media.schema.js';
import {
  PATIENT_MEDIA_IMAGE_LIMIT_BYTES,
  PATIENT_MEDIA_PDF_LIMIT_BYTES,
  PATIENT_MEDIA_TYPES,
  type PatientMediaType,
  type PatientMediaUploadFile,
  type PatientMediaUploadMetadata,
} from './patient-media.types.js';

const ALLOWED_MIME_TYPES: Readonly<Record<string, PatientMediaType>> = {
  'image/jpeg': PATIENT_MEDIA_TYPES.IMAGE,
  'image/png': PATIENT_MEDIA_TYPES.IMAGE,
  'image/webp': PATIENT_MEDIA_TYPES.IMAGE,
  'application/pdf': PATIENT_MEDIA_TYPES.PDF,
};

export interface ParsedPatientMediaUpload {
  file: PatientMediaUploadFile;
  metadata: PatientMediaUploadMetadata;
}

function hasExpectedSignature(content: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return (
      content.length >= 5 &&
      content[0] === 0xff &&
      content[1] === 0xd8 &&
      content[2] === 0xff &&
      content.at(-2) === 0xff &&
      content.at(-1) === 0xd9
    );
  }
  if (mimeType === 'image/png') {
    return (
      content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      content.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]))
    );
  }
  if (mimeType === 'image/webp') {
    return (
      content.length >= 12 &&
      content.subarray(0, 4).toString('ascii') === 'RIFF' &&
      content.subarray(8, 12).toString('ascii') === 'WEBP' &&
      content.readUInt32LE(4) + 8 === content.length
    );
  }
  if (mimeType === 'application/pdf') {
    const header = content.subarray(0, 5).toString('ascii');
    const tail = content.subarray(Math.max(0, content.length - 1024)).toString('latin1');
    const sample = content.toString('latin1').replace(/\s+/g, ' ');
    const activeContent = /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA)\b/i.test(sample);
    return header === '%PDF-' && tail.includes('%%EOF') && !activeContent;
  }
  return false;
}

function validateFile(
  content: Buffer,
  originalFileName: string,
  mimeType: string,
): PatientMediaUploadFile {
  const mediaType = ALLOWED_MIME_TYPES[mimeType];
  if (!mediaType) {
    throw new ValidationError('Only valid JPEG, PNG, WebP and PDF files are supported', {
      code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
    });
  }
  if (content.length === 0) {
    throw new ValidationError('The uploaded file is empty', { code: ERROR_CODES.INVALID_UPLOAD });
  }
  const limit =
    mediaType === PATIENT_MEDIA_TYPES.IMAGE
      ? PATIENT_MEDIA_IMAGE_LIMIT_BYTES
      : PATIENT_MEDIA_PDF_LIMIT_BYTES;
  if (content.length > limit) {
    throw new ValidationError(
      mediaType === PATIENT_MEDIA_TYPES.IMAGE
        ? 'Images must not exceed 10 MB'
        : 'PDF files must not exceed 20 MB',
      { code: ERROR_CODES.FILE_TOO_LARGE },
    );
  }
  if (!hasExpectedSignature(content, mimeType)) {
    throw new ValidationError('Only valid passive JPEG, PNG, WebP and PDF files are supported', {
      code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
    });
  }
  return {
    content,
    originalFileName: originalFileName.slice(0, 255),
    mimeType,
    mediaType,
  };
}

export async function parsePatientMediaUpload(
  request: FastifyRequest,
): Promise<ParsedPatientMediaUpload> {
  if (!request.isMultipart()) {
    throw new ValidationError('A multipart upload containing one file is required', {
      code: ERROR_CODES.INVALID_UPLOAD,
    });
  }

  const fields: Record<string, string> = {};
  let uploadFile: PatientMediaUploadFile | null = null;
  try {
    for await (const part of request.parts({
      limits: {
        fields: 8,
        files: 1,
        parts: 9,
        fieldSize: 2048,
        fileSize: PATIENT_MEDIA_PDF_LIMIT_BYTES,
      },
    })) {
      if (part.type === 'field') {
        if (typeof part.value === 'string') fields[part.fieldname] = part.value;
        continue;
      }
      if (uploadFile) {
        throw new ValidationError('Only one file may be uploaded at a time', {
          code: ERROR_CODES.INVALID_UPLOAD,
        });
      }
      const content = await part.toBuffer();
      uploadFile = validateFile(content, part.filename, part.mimetype);
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('The upload is invalid or exceeds the 20 MB request limit', {
      code: ERROR_CODES.INVALID_UPLOAD,
      cause: error,
    });
  }

  if (!uploadFile) {
    throw new ValidationError('Choose a file to upload', { code: ERROR_CODES.INVALID_UPLOAD });
  }
  const parsed = patientMediaUploadMetadataSchema.safeParse({
    category: fields['category'],
    title: fields['title'],
    description: fields['description'] || null,
    treatmentId: fields['treatmentId'] || null,
    capturedAt: fields['capturedAt'] || null,
  });
  if (!parsed.success) {
    throw new ValidationError('Upload metadata is invalid', {
      code: parsed.error.flatten().fieldErrors.category
        ? ERROR_CODES.INVALID_MEDIA_CATEGORY
        : ERROR_CODES.INVALID_UPLOAD,
      details: parsed.error.flatten().fieldErrors,
    });
  }

  return {
    file: uploadFile,
    metadata: {
      ...parsed.data,
      capturedAt: parsed.data.capturedAt ? new Date(parsed.data.capturedAt) : null,
    },
  };
}

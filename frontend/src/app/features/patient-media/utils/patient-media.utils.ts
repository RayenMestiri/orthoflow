import type { PatientMedia } from '../models/patient-media.models';

export const PATIENT_MEDIA_IMAGE_LIMIT_BYTES = 10 * 1024 * 1024;
export const PATIENT_MEDIA_PDF_LIMIT_BYTES = 20 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export function validatePatientMediaFile(file: File): string | null {
  if (!SUPPORTED_TYPES.has(file.type)) return 'Choose a JPEG, PNG, WebP or PDF file.';
  const limit =
    file.type === 'application/pdf'
      ? PATIENT_MEDIA_PDF_LIMIT_BYTES
      : PATIENT_MEDIA_IMAGE_LIMIT_BYTES;
  if (file.size === 0) return 'The selected file is empty.';
  if (file.size > limit) {
    return file.type === 'application/pdf'
      ? 'PDF files must not exceed 20 MB.'
      : 'Images must not exceed 10 MB.';
  }
  return null;
}

export function formatPatientMediaSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cloudinaryTransform(url: string, transformation: string): string {
  const marker = '/upload/';
  return url.includes(marker) ? url.replace(marker, `${marker}${transformation}/`) : url;
}

export function patientMediaThumbnailUrl(media: PatientMedia): string {
  return media.mediaType === 'IMAGE'
    ? cloudinaryTransform(media.secureUrl, 'c_fill,w_560,h_420,q_auto,f_auto')
    : media.secureUrl;
}

export function patientMediaPreviewUrl(media: PatientMedia): string {
  return media.mediaType === 'IMAGE'
    ? cloudinaryTransform(media.secureUrl, 'c_limit,w_1800,h_1800,q_auto,f_auto')
    : media.secureUrl;
}

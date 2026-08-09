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

/**
 * Non-destructive thumbnail — c_fit preserves the complete image within the
 * given bounds without cropping or stretching. Clinical photos must never be
 * cut: the full composition is clinically meaningful.
 */
export function patientMediaThumbnailUrl(media: PatientMedia): string {
  if (media.mediaType !== 'IMAGE') return media.secureUrl;
  // Local data-URIs have no Cloudinary /upload/ segment; return as-is
  if (media.secureUrl.startsWith('data:')) return media.secureUrl;
  return cloudinaryTransform(media.secureUrl, 'c_fit,w_600,h_450,q_auto,f_auto');
}

export function patientMediaPreviewUrl(media: PatientMedia): string {
  if (media.mediaType !== 'IMAGE') return media.secureUrl;
  if (media.secureUrl.startsWith('data:')) return media.secureUrl;
  return cloudinaryTransform(media.secureUrl, 'c_limit,w_1800,h_1800,q_auto,f_auto');
}

/** Creates a temporary local preview URL from a File object. Call revokeLocalPreview() to clean up. */
export function createLocalPreview(file: File): string | null {
  if (!file.type.startsWith('image/')) return null;
  return URL.createObjectURL(file);
}

export function revokeLocalPreview(url: string | null): void {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

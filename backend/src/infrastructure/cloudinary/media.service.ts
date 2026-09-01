import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';
import { cloudinaryConfig, getCloudinary } from '../../config/cloudinary.js';
import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { ServiceUnavailableError } from '../../common/errors/app-error.js';

/**
 * Where a file belongs inside a clinic's media tree. Keeping this an enum-like
 * union (rather than a free string) means folder layout stays predictable and a
 * caller cannot path-traverse out of its own tenant folder.
 */
export const MEDIA_SCOPES = {
  TREATMENT_PHOTOS: 'treatment-photos',
  PATIENT_DOCUMENTS: 'patient-documents',
  PROFILE_PHOTOS: 'profile-photos',
  CONSENT_ARTIFACTS: 'consent-artifacts',
  GENERATED_DOCUMENTS: 'generated-documents',
} as const;

export type MediaScope = (typeof MEDIA_SCOPES)[keyof typeof MEDIA_SCOPES];

/** Metadata we persist in MongoDB. The binary itself never touches our disk. */
export interface StoredMedia {
  provider: 'cloudinary';
  publicId: string;
  secureUrl: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  resourceType: string;
  deliveryType?: 'upload' | 'authenticated';
  uploadedAt: Date;
}

export interface UploadMediaInput {
  clinicId: string;
  scope: MediaScope;
  /** Opaque, validated path segments such as a patient id. */
  subfolders?: readonly string[];
  content: Buffer;
  /** Original file name, used only to derive a readable public id. */
  fileName?: string;
  mimeType?: string;
  /** Sensitive evidence is uploaded as an authenticated Cloudinary asset. */
  deliveryType?: 'upload' | 'authenticated';
}

/**
 * The only place in the codebase that talks to Cloudinary.
 *
 * Controllers and services depend on this interface, never on the SDK, so the
 * storage provider can be swapped (S3, on-prem) without touching any domain.
 *
 * NO LOCAL FALLBACK, DELIBERATELY. An earlier revision base64-encoded the file
 * into a `data:` URL and stored it in `secureUrl` whenever Cloudinary was
 * unconfigured or threw. That put the binary inside the MongoDB document: a
 * 10 MB photo becomes ~13 MB of base64 against a 16 MB document ceiling, a
 * 20 MB PDF cannot be written at all, and every gallery read drags the whole
 * payload back through Mongo, Fastify and Angular. It also hid real upload
 * failures behind an apparent success. Storage being down is an outage the
 * clinic must see, not something to paper over — see AGENTS.md §9 and §16.
 */
export class MediaService {
  isEnabled(): boolean {
    return cloudinaryConfig.enabled;
  }

  /**
   * Builds the tenant-scoped folder path.
   * Every asset lives under its clinic, which keeps one clinic's photos out of
   * another's folder listing even at the storage-provider level.
   */
  buildFolder(clinicId: string, scope: MediaScope, subfolders: readonly string[] = []): string {
    const safeSegments = subfolders.filter((segment) => /^[a-zA-Z0-9_-]+$/.test(segment));
    if (safeSegments.length !== subfolders.length) {
      throw new Error('Media folder segments must contain opaque identifiers only');
    }
    return [cloudinaryConfig.rootFolder, 'clinics', clinicId, scope, ...safeSegments].join('/');
  }

  async upload(input: UploadMediaInput): Promise<StoredMedia> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableError('Media storage is not configured', {
        code: ERROR_CODES.MEDIA_STORAGE_UNAVAILABLE,
      });
    }

    const isPdf =
      input.mimeType === 'application/pdf' ||
      (input.fileName !== undefined && input.fileName.toLowerCase().endsWith('.pdf'));

    const cloudinary = getCloudinary();
    const options: UploadApiOptions = {
      folder: this.buildFolder(input.clinicId, input.scope, input.subfolders),
      resource_type: isPdf ? 'raw' : 'auto',
      overwrite: false,
      unique_filename: true,
      use_filename: input.fileName !== undefined,
      filename_override: input.fileName,
      // Clinical photos must never be transformed or stripped on the way in.
      invalidate: true,
      type: input.deliveryType ?? 'upload',
    };

    const response = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error || !result) {
          // A typed error, never the provider's raw object: the client gets a
          // stable code and the provider's internals stay out of the response.
          reject(
            new ServiceUnavailableError('Media upload failed', {
              code: ERROR_CODES.MEDIA_UPLOAD_FAILED,
              cause: error,
            }),
          );
          return;
        }
        resolve(result);
      });
      stream.end(input.content);
    });

    return {
      provider: 'cloudinary',
      publicId: response.public_id,
      secureUrl: response.secure_url,
      format: response.format ?? '',
      bytes: response.bytes,
      width: response.width ?? null,
      height: response.height ?? null,
      resourceType: response.resource_type,
      deliveryType: input.deliveryType ?? 'upload',
      uploadedAt: new Date(),
    };
  }

  /**
   * Downloads a private asset server-side. The signed provider URL never leaves
   * the API, so every caller still passes normal OrthoFlow auth and tenancy.
   */
  async download(
    publicId: string,
    resourceType: string,
    deliveryType: 'upload' | 'authenticated' = 'authenticated',
    format = '',
  ): Promise<Buffer> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableError('Media storage is not configured', {
        code: ERROR_CODES.MEDIA_STORAGE_UNAVAILABLE,
      });
    }
    const cloudinary = getCloudinary();

    const hasExt = /\.[a-zA-Z0-9]+$/.test(publicId);
    let resolvedFormat = format;
    if (!resolvedFormat) {
      if (resourceType === 'raw' || publicId.endsWith('.pdf')) {
        resolvedFormat = hasExt ? '' : 'pdf';
      } else {
        const extMatch = publicId.match(/\.([a-zA-Z0-9]+)$/);
        resolvedFormat = extMatch?.[1] ?? '';
      }
    } else if (hasExt && publicId.endsWith(`.${resolvedFormat}`)) {
      resolvedFormat = '';
    }

    let downloadUrl = '';
    if (resourceType === 'raw' || deliveryType === 'authenticated') {
      downloadUrl =
        cloudinary.utils.private_download_url(publicId, resolvedFormat, {
          resource_type: resourceType,
          type: deliveryType,
        }) ?? '';
    } else {
      downloadUrl =
        cloudinary.url(publicId, {
          resource_type: resourceType,
          type: deliveryType,
          secure: true,
          format: resolvedFormat || undefined,
        }) ?? '';
    }

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new ServiceUnavailableError('Media download failed', {
        code: ERROR_CODES.MEDIA_STORAGE_UNAVAILABLE,
      });
    }
    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Creates a short-lived provider URL for an already-authorized browser read.
   * The durable Cloudinary URL is never returned by domain DTOs.
   */
  createPrivateDownloadUrl(
    publicId: string,
    resourceType: string,
    deliveryType: 'upload' | 'authenticated' = 'authenticated',
    format = '',
    lifetimeSeconds = env.MEDIA_SIGNED_URL_TTL_SECONDS,
  ): string {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableError('Media storage is not configured', {
        code: ERROR_CODES.MEDIA_STORAGE_UNAVAILABLE,
      });
    }
    const hasExt = /\.[a-zA-Z0-9]+$/.test(publicId);
    let resolvedFormat = format;
    if (!resolvedFormat) {
      if (resourceType === 'raw' || publicId.endsWith('.pdf')) {
        resolvedFormat = hasExt ? '' : 'pdf';
      } else {
        const extMatch = publicId.match(/\.([a-zA-Z0-9]+)$/);
        resolvedFormat = extMatch?.[1] ?? '';
      }
    } else if (hasExt && publicId.endsWith(`.${resolvedFormat}`)) {
      resolvedFormat = '';
    }

    const cloudinary = getCloudinary();

    if (resourceType === 'raw') {
      return (
        cloudinary.utils.private_download_url(publicId, resolvedFormat, {
          resource_type: 'raw',
          type: deliveryType,
          expires_at: Math.floor(Date.now() / 1000) + lifetimeSeconds,
        }) ?? ''
      );
    }

    if (deliveryType === 'upload') {
      return cloudinary.url(publicId, {
        resource_type: resourceType,
        secure: true,
        format: resolvedFormat || undefined,
      });
    }

    return cloudinary.url(publicId, {
      resource_type: 'image',
      type: 'authenticated',
      sign_url: true,
      secure: true,
      format: resolvedFormat || undefined,
      expires_at: Math.floor(Date.now() / 1000) + lifetimeSeconds,
    });
  }

  /**
   * Removes an asset from storage.
   *
   * Callers are responsible for the audit entry — deleting a treatment photo is
   * a clinically meaningful act and must leave a trace even though the binary
   * is gone. Errors propagate: this is used for orphan cleanup after a failed
   * metadata write, and a silent failure there leaves a file nobody knows about.
   */
  async remove(publicId: string, resourceType = 'image'): Promise<void> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableError('Media storage is not configured', {
        code: ERROR_CODES.MEDIA_STORAGE_UNAVAILABLE,
      });
    }
    const cloudinary = getCloudinary();
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
  }
}

export const mediaService = new MediaService();

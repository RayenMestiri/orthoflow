import { v2 as cloudinary } from 'cloudinary';
import { ERROR_CODES } from '../common/constants/error-codes.js';
import { ServiceUnavailableError } from '../common/errors/app-error.js';
import { env, isCloudinaryConfigured } from './env.js';

let configured = false;

/**
 * Returns the configured Cloudinary SDK.
 *
 * Configuration is lazy so that a deployment without media credentials still
 * boots — media becomes unavailable, the rest of the API does not.
 * Nothing outside `MediaService` should import this module.
 */
export function getCloudinary(): typeof cloudinary {
  if (!isCloudinaryConfigured) {
    throw new ServiceUnavailableError('Media storage is not configured', {
      code: ERROR_CODES.MEDIA_STORAGE_UNAVAILABLE,
    });
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }

  return cloudinary;
}

export const cloudinaryConfig = {
  rootFolder: env.CLOUDINARY_UPLOAD_FOLDER,
  enabled: isCloudinaryConfigured,
} as const;

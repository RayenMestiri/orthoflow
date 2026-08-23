import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { ServiceUnavailableError } from '../../common/errors/app-error.js';
import { sha256Bytes } from '../security/crypto.js';
import {
  mediaService,
  type MediaScope,
  type MediaService,
} from '../cloudinary/media.service.js';

export interface SecurePdfArtifact {
  provider: 'CLOUDINARY';
  publicId: string;
  resourceType: string;
  deliveryType: 'authenticated';
  mimeType: 'application/pdf';
  byteSize: number;
  sha256: string;
}

type PdfStorage = Pick<MediaService, 'isEnabled' | 'upload' | 'download' | 'remove'>;

export class SecurePdfArtifactService {
  constructor(private readonly storage: PdfStorage = mediaService) {}

  isEnabled(): boolean {
    return this.storage.isEnabled();
  }

  async store(input: {
    clinicId: string;
    scope: MediaScope;
    subfolders: readonly string[];
    fileName: string;
    content: Buffer;
  }): Promise<SecurePdfArtifact> {
    const stored = await this.storage.upload({
      ...input,
      mimeType: 'application/pdf',
      deliveryType: 'authenticated',
    });
    return {
      provider: 'CLOUDINARY',
      publicId: stored.publicId,
      resourceType: stored.resourceType,
      deliveryType: 'authenticated',
      mimeType: 'application/pdf',
      byteSize: stored.bytes,
      sha256: sha256Bytes(input.content),
    };
  }

  async downloadVerified(artifact: SecurePdfArtifact): Promise<Buffer> {
    const content = await this.storage.download(
      artifact.publicId,
      artifact.resourceType,
      artifact.deliveryType,
    );
    if (sha256Bytes(content) !== artifact.sha256) {
      throw new ServiceUnavailableError('The finalized PDF failed its integrity check', {
        code: ERROR_CODES.DOCUMENT_ARTIFACT_INTEGRITY_FAILED,
      });
    }
    return content;
  }

  async remove(artifact: Pick<SecurePdfArtifact, 'publicId' | 'resourceType'>): Promise<void> {
    await this.storage.remove(artifact.publicId, artifact.resourceType);
  }
}

export const securePdfArtifactService = new SecurePdfArtifactService();

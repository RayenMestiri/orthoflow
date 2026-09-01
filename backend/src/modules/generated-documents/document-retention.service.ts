import type { FastifyBaseLogger } from 'fastify';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { mediaService, type MediaService } from '../../infrastructure/cloudinary/media.service.js';
import {
  generatedDocumentRepository,
  type GeneratedDocumentRepository,
} from './generated-document.repository.js';
import { logger } from '../../config/logger.js';

const BATCH_SIZE = 50;

type StoragePort = Pick<MediaService, 'isEnabled' | 'remove'>;
type AuditPort = Pick<AuditLogService, 'record'>;

export class DocumentRetentionService {
  constructor(
    private readonly documents: GeneratedDocumentRepository = generatedDocumentRepository,
    private readonly storage: StoragePort = mediaService,
    private readonly audit: AuditPort = auditLogService,
  ) {}

  /**
   * Sweeps expired generated documents across all clinics, removing their storage binary
   * and updating their lifecycle state to EXPIRED while retaining a safe audit/metadata tombstone.
   */
  async sweep(log: FastifyBaseLogger = logger): Promise<number> {
    const candidates = await this.documents.findExpiredCandidates(BATCH_SIZE, new Date());
    if (candidates.length === 0) return 0;

    let processedCount = 0;

    for (const doc of candidates) {
      const docId = doc._id.toString();
      const clinicId = doc.clinicId.toString();

      try {
        // 1. Remove binary from storage provider if present
        if (this.storage.isEnabled() && doc.finalizedPdf?.publicId) {
          try {
            await this.storage.remove(doc.finalizedPdf.publicId, doc.finalizedPdf.resourceType);
          } catch (storageError) {
            log.warn(
              { err: storageError, docId, clinicId, publicId: doc.finalizedPdf.publicId },
              'Storage binary cleanup reported an issue; continuing database tombstone update',
            );
          }
        }

        // 2. Atomically transition state in database to EXPIRED and remove artifact reference
        const now = new Date();
        const updated = await this.documents.markExpiredAndRemoveBinary(
          docId,
          clinicId,
          now,
          'AUTOMATIC_30_DAY_EXPIRATION',
        );

        if (!updated) {
          log.debug({ docId, clinicId }, 'Document was already modified or claimed');
          continue;
        }

        // 3. Record safe audit trail (no clinical document contents)
        await this.audit.record({
          clinicId,
          actorUserId: doc.generatedByUserId.toString(),
          action: AUDIT_ACTIONS.GENERATED_DOCUMENT_EXPIRED,
          resourceType: AUDIT_RESOURCE_TYPES.GENERATED_DOCUMENT,
          resourceId: docId,
          metadata: {
            documentRef: doc.documentRef,
            patientId: doc.patientId.toString(),
            category: doc.category,
            templateCode: doc.templateCode,
            templateVersion: doc.templateVersion,
            retentionExpiresAt: doc.retentionExpiresAt?.toISOString() ?? null,
            deletedAt: now.toISOString(),
            reason: 'AUTOMATIC_30_DAY_EXPIRATION',
          },
          ip: '127.0.0.1',
          userAgent: 'OrthoFlow-DocumentRetentionWorker/1.0',
        });

        processedCount++;
        log.info(
          { docId, documentRef: doc.documentRef, clinicId },
          'Document expired and binary removed successfully',
        );
      } catch (error) {
        log.error(
          { err: error, docId, clinicId },
          'Failed to process retention cleanup for document',
        );
      }
    }

    return processedCount;
  }
}

export const documentRetentionService = new DocumentRetentionService();

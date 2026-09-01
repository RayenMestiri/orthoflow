import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentRetentionService } from '../../src/modules/generated-documents/document-retention.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../../src/modules/audit-logs/audit-log.types.js';
import type { GeneratedDocumentRecord } from '../../src/modules/generated-documents/generated-document.types.js';
import { Types } from 'mongoose';

describe('DocumentRetentionService', () => {
  let repository: any;
  let storage: any;
  let audit: any;
  let logger: any;
  let service: DocumentRetentionService;

  const clinicId = new Types.ObjectId().toString();
  const patientId = new Types.ObjectId().toString();
  const documentId = new Types.ObjectId().toString();

  const mockExpiredDoc: GeneratedDocumentRecord = {
    _id: new Types.ObjectId(documentId),
    clinicId: new Types.ObjectId(clinicId),
    patientId: new Types.ObjectId(patientId),
    documentRef: 'DOC-2026-000001',
    templateId: new Types.ObjectId(),
    templateCode: 'CERT_PRESENCE',
    templateVersion: 1,
    category: 'ATTENDANCE_CERTIFICATE',
    titleSnapshot: 'Certificat de présence',
    contentSnapshot: [],
    contextSnapshot: {
      patient: { id: patientId, fullName: 'Ahmed Ben Ali', birthDate: null, referenceNumber: null },
      guardian: null,
      treatment: null,
      retention: null,
      appointment: null,
      finance: null,
    },
    generatedByUserId: new Types.ObjectId(),
    generatedByNameSnapshot: 'Dr Nadia',
    generatedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
    retentionExpiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // expired 5 days ago
    finalizedPdf: {
      provider: 'CLOUDINARY',
      publicId: 'clinics/c1/generated-documents/doc-1',
      resourceType: 'raw',
      deliveryType: 'authenticated',
      mimeType: 'application/pdf',
      byteSize: 12450,
      sha256: 'a'.repeat(64),
    },
    idempotencyKey: 'idem-1234567890123456',
    payloadDigest: 'b'.repeat(64),
    status: 'FINALIZED',
    voidedAt: null,
    voidedByUserId: null,
    voidReason: null,
    deletedAt: null,
    deletionReason: null,
    createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
  };

  beforeEach(() => {
    repository = {
      findExpiredCandidates: vi.fn().mockResolvedValue([mockExpiredDoc]),
      markExpiredAndRemoveBinary: vi.fn().mockResolvedValue({
        ...mockExpiredDoc,
        status: 'EXPIRED',
        finalizedPdf: null,
        deletedAt: new Date(),
        deletionReason: 'AUTOMATIC_30_DAY_EXPIRATION',
      }),
    };
    storage = {
      isEnabled: vi.fn().mockReturnValue(true),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    audit = {
      record: vi.fn().mockResolvedValue(undefined),
    };
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    service = new DocumentRetentionService(repository, storage, audit);
  });

  it('sweeps expired documents, removes cloud storage binary, and records safe audit trail', async () => {
    const processed = await service.sweep(logger);

    expect(processed).toBe(1);
    expect(repository.findExpiredCandidates).toHaveBeenCalledWith(50, expect.any(Date));
    expect(storage.remove).toHaveBeenCalledWith(
      'clinics/c1/generated-documents/doc-1',
      'raw',
    );
    expect(repository.markExpiredAndRemoveBinary).toHaveBeenCalledWith(
      documentId,
      clinicId,
      expect.any(Date),
      'AUTOMATIC_30_DAY_EXPIRATION',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId,
        action: AUDIT_ACTIONS.GENERATED_DOCUMENT_EXPIRED,
        resourceType: AUDIT_RESOURCE_TYPES.GENERATED_DOCUMENT,
        resourceId: documentId,
        metadata: expect.objectContaining({
          documentRef: 'DOC-2026-000001',
          category: 'ATTENDANCE_CERTIFICATE',
          reason: 'AUTOMATIC_30_DAY_EXPIRATION',
        }),
      }),
    );
  });

  it('returns 0 when no documents have expired', async () => {
    repository.findExpiredCandidates.mockResolvedValue([]);
    const processed = await service.sweep(logger);

    expect(processed).toBe(0);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(repository.markExpiredAndRemoveBinary).not.toHaveBeenCalled();
  });

  it('tolerates storage removal errors and still records tombstone in database', async () => {
    storage.remove.mockRejectedValue(new Error('Cloudinary not reachable'));

    const processed = await service.sweep(logger);

    expect(processed).toBe(1);
    expect(repository.markExpiredAndRemoveBinary).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});

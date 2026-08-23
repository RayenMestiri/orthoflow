import { Types } from 'mongoose';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { GeneratedDocumentModel } from '../generated-documents/generated-document.model.js';
import type { GeneratedDocumentRecord } from '../generated-documents/generated-document.types.js';
import { PatientGuardianModel } from '../guardians/patient-guardian.model.js';
import { portalRepository } from './portal.repository.js';
import { auditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';

export class PortalManagementService {
  async shareDocument(
    clinicId: string,
    documentId: string,
    guardianId: string,
    actorUserId: string,
  ) {
    const document = await GeneratedDocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      clinicId: new Types.ObjectId(clinicId),
    })
      .lean<GeneratedDocumentRecord | null>()
      .exec();
    if (!document)
      throw new NotFoundError('Generated document not found', {
        code: ERROR_CODES.GENERATED_DOCUMENT_NOT_FOUND,
      });
    const relation = await PatientGuardianModel.exists({
      clinicId: new Types.ObjectId(clinicId),
      patientId: document.patientId,
      guardianId: new Types.ObjectId(guardianId),
    }).exec();
    if (!relation)
      throw new NotFoundError('Guardian is not linked to this patient', {
        code: ERROR_CODES.GUARDIAN_NOT_FOUND,
      });
    const share = await portalRepository.shareDocument({
      clinicId,
      patientId: document.patientId.toString(),
      guardianId,
      documentId,
      actorUserId,
    });
    await auditLogService.recordSafe({
      clinicId,
      actorUserId,
      actorKind: 'STAFF',
      action: AUDIT_ACTIONS.PORTAL_DOCUMENT_SHARED,
      resourceType: AUDIT_RESOURCE_TYPES.GENERATED_DOCUMENT,
      resourceId: documentId,
      metadata: { patientId: document.patientId.toString(), guardianId },
    });
    return {
      guardianId,
      documentId,
      patientId: document.patientId.toString(),
      sharedAt: share.sharedAt.toISOString(),
    };
  }
  async revokeDocument(
    clinicId: string,
    documentId: string,
    guardianId: string,
    actorUserId: string,
  ): Promise<void> {
    const document = await GeneratedDocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      clinicId: new Types.ObjectId(clinicId),
    })
      .lean<GeneratedDocumentRecord | null>()
      .exec();
    if (!document)
      throw new NotFoundError('Generated document not found', {
        code: ERROR_CODES.GENERATED_DOCUMENT_NOT_FOUND,
      });
    await portalRepository.revokeDocumentShare({
      clinicId,
      patientId: document.patientId.toString(),
      guardianId,
      documentId,
      actorUserId,
    });
    await auditLogService.recordSafe({
      clinicId,
      actorUserId,
      actorKind: 'STAFF',
      action: AUDIT_ACTIONS.PORTAL_DOCUMENT_SHARE_REVOKED,
      resourceType: AUDIT_RESOURCE_TYPES.GENERATED_DOCUMENT,
      resourceId: documentId,
      metadata: { patientId: document.patientId.toString(), guardianId },
    });
  }
}
export const portalManagementService = new PortalManagementService();

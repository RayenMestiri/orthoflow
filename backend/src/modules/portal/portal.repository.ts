import type { ClientSession } from 'mongoose';
import { toObjectId } from '../../common/utils/object-id.js';
import {
  PortalDocumentShareModel,
  PortalInvitationModel,
  PortalSessionModel,
  PortalUserModel,
} from './portal.model.js';
import type {
  PortalDocumentShareRecord,
  PortalInvitationRecord,
  PortalSessionRecord,
  PortalSessionRevokeReason,
  PortalUserRecord,
} from './portal.types.js';

export class PortalRepository {
  async findUserById(id: string, withPassword = false): Promise<PortalUserRecord | null> {
    const query = PortalUserModel.findById(toObjectId(id, 'portalUserId'));
    if (withPassword) query.select('+passwordHash');
    return query.lean<PortalUserRecord | null>().exec();
  }
  async findUserByEmail(email: string, clinicId?: string): Promise<PortalUserRecord | null> {
    const query = PortalUserModel.findOne({
      email: email.toLowerCase(),
      ...(clinicId ? { clinicId: toObjectId(clinicId, 'clinicId') } : {}),
    }).select('+passwordHash');
    return query.lean<PortalUserRecord | null>().exec();
  }
  async findUserByGuardian(clinicId: string, guardianId: string): Promise<PortalUserRecord | null> {
    return PortalUserModel.findOne({
      clinicId: toObjectId(clinicId, 'clinicId'),
      guardianId: toObjectId(guardianId, 'guardianId'),
    })
      .lean<PortalUserRecord | null>()
      .exec();
  }
  async createUser(
    input: { clinicId: string; guardianId: string; email: string; passwordHash: string },
    session?: ClientSession,
  ): Promise<PortalUserRecord> {
    const [created] = await PortalUserModel.create(
      [
        {
          clinicId: toObjectId(input.clinicId, 'clinicId'),
          guardianId: toObjectId(input.guardianId, 'guardianId'),
          email: input.email.toLowerCase(),
          passwordHash: input.passwordHash,
          emailVerifiedAt: new Date(),
          lastLoginAt: null,
          revokedAt: null,
          revokedByUserId: null,
          revocationReason: null,
        },
      ],
      { session, ordered: true },
    );
    if (!created) throw new Error('Portal user creation failed');
    return created.toObject<PortalUserRecord>();
  }
  async reactivateUser(
    input: { clinicId: string; guardianId: string; email: string; passwordHash: string },
    session?: ClientSession,
  ): Promise<PortalUserRecord | null> {
    const query = PortalUserModel.findOneAndUpdate(
      {
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        guardianId: toObjectId(input.guardianId, 'guardianId'),
        status: 'REVOKED',
      },
      {
        $set: {
          email: input.email.toLowerCase(),
          passwordHash: input.passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          revokedAt: null,
          revokedByUserId: null,
          revocationReason: null,
        },
      },
      { new: true, runValidators: true },
    );
    if (session) query.session(session);
    return query.lean<PortalUserRecord | null>().exec();
  }
  async markLogin(id: string): Promise<void> {
    await PortalUserModel.updateOne(
      { _id: toObjectId(id, 'portalUserId') },
      { $set: { lastLoginAt: new Date() } },
    ).exec();
  }
  async revokeUser(
    clinicId: string,
    guardianId: string,
    actorUserId: string,
    reason: string,
  ): Promise<PortalUserRecord | null> {
    return PortalUserModel.findOneAndUpdate(
      {
        clinicId: toObjectId(clinicId, 'clinicId'),
        guardianId: toObjectId(guardianId, 'guardianId'),
      },
      {
        $set: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedByUserId: toObjectId(actorUserId, 'actorUserId'),
          revocationReason: reason,
        },
      },
      { new: true },
    )
      .lean<PortalUserRecord | null>()
      .exec();
  }

  async createInvitation(input: {
    clinicId: string;
    guardianId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
    invitedByUserId: string;
  }): Promise<PortalInvitationRecord> {
    await PortalInvitationModel.updateMany(
      {
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        guardianId: toObjectId(input.guardianId, 'guardianId'),
        consumedAt: null,
        revokedAt: null,
      },
      { $set: { revokedAt: new Date() } },
    ).exec();
    const [created] = await PortalInvitationModel.create([
      {
        ...input,
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        guardianId: toObjectId(input.guardianId, 'guardianId'),
        invitedByUserId: toObjectId(input.invitedByUserId, 'invitedByUserId'),
        consumedAt: null,
        revokedAt: null,
      },
    ]);
    if (!created) throw new Error('Portal invitation creation failed');
    return created.toObject<PortalInvitationRecord>();
  }
  async findUsableInvitation(tokenHash: string): Promise<PortalInvitationRecord | null> {
    return PortalInvitationModel.findOne({
      tokenHash,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .lean<PortalInvitationRecord | null>()
      .exec();
  }
  async consumeInvitation(id: string, session?: ClientSession): Promise<boolean> {
    const q = PortalInvitationModel.updateOne(
      { _id: toObjectId(id, 'invitationId'), consumedAt: null, revokedAt: null },
      { $set: { consumedAt: new Date() } },
    );
    if (session) q.session(session);
    return (await q.exec()).modifiedCount === 1;
  }
  async latestInvitation(
    clinicId: string,
    guardianId: string,
  ): Promise<PortalInvitationRecord | null> {
    return PortalInvitationModel.findOne({
      clinicId: toObjectId(clinicId, 'clinicId'),
      guardianId: toObjectId(guardianId, 'guardianId'),
    })
      .sort({ createdAt: -1 })
      .lean<PortalInvitationRecord | null>()
      .exec();
  }
  async revokeInvitations(clinicId: string, guardianId: string): Promise<void> {
    await PortalInvitationModel.updateMany(
      {
        clinicId: toObjectId(clinicId, 'clinicId'),
        guardianId: toObjectId(guardianId, 'guardianId'),
        consumedAt: null,
        revokedAt: null,
      },
      { $set: { revokedAt: new Date() } },
    ).exec();
  }

  async createSession(input: {
    sessionId: string;
    portalUserId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    ip: string | null;
    userAgent: string | null;
  }): Promise<PortalSessionRecord> {
    const [created] = await PortalSessionModel.create([
      {
        _id: toObjectId(input.sessionId, 'sessionId'),
        portalUserId: toObjectId(input.portalUserId, 'portalUserId'),
        familyId: input.familyId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        ip: input.ip,
        userAgent: input.userAgent?.slice(0, 256) ?? null,
        revokedAt: null,
        revokedReason: null,
        replacedBySessionId: null,
      },
    ]);
    if (!created) throw new Error('Portal session creation failed');
    return created.toObject<PortalSessionRecord>();
  }
  async findSession(id: string): Promise<PortalSessionRecord | null> {
    return PortalSessionModel.findById(toObjectId(id, 'sessionId'))
      .lean<PortalSessionRecord | null>()
      .exec();
  }
  async sessionUsable(id: string): Promise<boolean> {
    return (
      (await PortalSessionModel.exists({
        _id: toObjectId(id, 'sessionId'),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }).exec()) !== null
    );
  }
  async revokeSession(
    id: string,
    reason: PortalSessionRevokeReason,
    replacement?: string,
  ): Promise<PortalSessionRecord | null> {
    return PortalSessionModel.findOneAndUpdate(
      { _id: toObjectId(id, 'sessionId'), revokedAt: null },
      {
        $set: {
          revokedAt: new Date(),
          revokedReason: reason,
          replacedBySessionId: replacement ? toObjectId(replacement, 'replacement') : null,
        },
      },
      { new: true },
    )
      .lean<PortalSessionRecord | null>()
      .exec();
  }
  async revokeFamily(
    userId: string,
    familyId: string,
    reason: PortalSessionRevokeReason,
  ): Promise<void> {
    await PortalSessionModel.updateMany(
      { portalUserId: toObjectId(userId, 'portalUserId'), familyId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    ).exec();
  }
  async revokeAll(userId: string, reason: PortalSessionRevokeReason): Promise<void> {
    await PortalSessionModel.updateMany(
      { portalUserId: toObjectId(userId, 'portalUserId'), revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    ).exec();
  }

  async shareDocument(input: {
    clinicId: string;
    patientId: string;
    guardianId: string;
    documentId: string;
    actorUserId: string;
  }): Promise<PortalDocumentShareRecord> {
    return PortalDocumentShareModel.findOneAndUpdate(
      {
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        patientId: toObjectId(input.patientId, 'patientId'),
        guardianId: toObjectId(input.guardianId, 'guardianId'),
        generatedDocumentId: toObjectId(input.documentId, 'documentId'),
      },
      {
        $set: {
          sharedByUserId: toObjectId(input.actorUserId, 'actorUserId'),
          sharedAt: new Date(),
          revokedAt: null,
          revokedByUserId: null,
        },
      },
      { new: true, upsert: true, runValidators: true },
    )
      .lean<PortalDocumentShareRecord>()
      .exec();
  }
  async revokeDocumentShare(input: {
    clinicId: string;
    patientId: string;
    guardianId: string;
    documentId: string;
    actorUserId: string;
  }): Promise<void> {
    await PortalDocumentShareModel.updateOne(
      {
        clinicId: toObjectId(input.clinicId, 'clinicId'),
        patientId: toObjectId(input.patientId, 'patientId'),
        guardianId: toObjectId(input.guardianId, 'guardianId'),
        generatedDocumentId: toObjectId(input.documentId, 'documentId'),
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: new Date(),
          revokedByUserId: toObjectId(input.actorUserId, 'actorUserId'),
        },
      },
    ).exec();
  }
  async listSharedDocuments(
    clinicId: string,
    guardianId: string,
    patientIds: string[],
  ): Promise<PortalDocumentShareRecord[]> {
    return PortalDocumentShareModel.find({
      clinicId: toObjectId(clinicId, 'clinicId'),
      guardianId: toObjectId(guardianId, 'guardianId'),
      patientId: { $in: patientIds.map((id) => toObjectId(id, 'patientId')) },
      revokedAt: null,
    })
      .sort({ sharedAt: -1 })
      .lean<PortalDocumentShareRecord[]>()
      .exec();
  }
  async findDocumentShare(
    clinicId: string,
    guardianId: string,
    patientId: string,
    documentId: string,
  ): Promise<PortalDocumentShareRecord | null> {
    return PortalDocumentShareModel.findOne({
      clinicId: toObjectId(clinicId, 'clinicId'),
      guardianId: toObjectId(guardianId, 'guardianId'),
      patientId: toObjectId(patientId, 'patientId'),
      generatedDocumentId: toObjectId(documentId, 'documentId'),
      revokedAt: null,
    })
      .lean<PortalDocumentShareRecord | null>()
      .exec();
  }
}
export const portalRepository = new PortalRepository();

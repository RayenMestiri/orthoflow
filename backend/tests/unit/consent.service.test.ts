import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import {
  ConsentService,
  ConsentTemplateService,
} from '../../src/modules/consents/consent.service.js';
import {
  CONSENT_SIGNER_TYPES,
  CONSENT_TEMPLATE_STATUSES,
  SIGNED_CONSENT_STATUSES,
  type ConsentMutationContext,
  type ConsentTemplateRecord,
  type SignedConsentRecord,
} from '../../src/modules/consents/consent.types.js';

const CLINIC_ID = new Types.ObjectId().toString();
const PATIENT_ID = new Types.ObjectId().toString();
const TEMPLATE_ID = new Types.ObjectId().toString();
const CONSENT_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();
const CONTEXT: ConsentMutationContext = {
  actorUserId: USER_ID,
  clinicRole: CLINIC_ROLES.CLINIC_OWNER,
  ip: null,
  userAgent: null,
};

function template(overrides: Partial<ConsentTemplateRecord> = {}): ConsentTemplateRecord {
  const now = new Date('2026-08-23T09:00:00.000Z');
  return {
    _id: new Types.ObjectId(TEMPLATE_ID),
    clinicId: new Types.ObjectId(CLINIC_ID),
    code: 'ORTHO',
    version: 2,
    title: 'Orthodontic consent',
    category: 'TREATMENT',
    content: 'Reviewed content for {{patient.fullName}} on {{date}}.',
    status: CONSENT_TEMPLATE_STATUSES.ACTIVE,
    createdByUserId: new Types.ObjectId(USER_ID),
    updatedByUserId: new Types.ObjectId(USER_ID),
    activatedAt: now,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function signed(payloadDigest: string): SignedConsentRecord {
  const now = new Date('2026-08-23T10:00:00.000Z');
  const artifact = {
    provider: 'CLOUDINARY' as const,
    publicId: 'orthoflow/consent/evidence',
    resourceType: 'raw',
    deliveryType: 'authenticated' as const,
    mimeType: 'application/pdf',
    byteSize: 4000,
    sha256: createHash('sha256').update('pdf').digest('hex'),
  };
  return {
    _id: new Types.ObjectId(CONSENT_ID),
    clinicId: new Types.ObjectId(CLINIC_ID),
    patientId: new Types.ObjectId(PATIENT_ID),
    treatmentId: null,
    retentionPlanId: null,
    consentRef: 'CNS-2026-000001',
    templateId: new Types.ObjectId(TEMPLATE_ID),
    templateCode: 'ORTHO',
    templateVersion: 2,
    category: 'TREATMENT',
    titleSnapshot: 'Orthodontic consent',
    contentSnapshot: 'Reviewed content for Nadia Patient.',
    patientNameSnapshot: 'Nadia Patient',
    signerType: CONSENT_SIGNER_TYPES.PATIENT,
    guardianId: null,
    signerNameSnapshot: 'Nadia Patient',
    signerRelationshipSnapshot: null,
    status: SIGNED_CONSENT_STATUSES.SIGNED,
    signedAt: now,
    presentedByUserId: new Types.ObjectId(USER_ID),
    presentedByNameSnapshot: 'Dr Aymen',
    signatureArtifact: { ...artifact, mimeType: 'image/png' },
    finalizedPdf: artifact,
    idempotencyKey: '12345678-1234-4234-9234-123456789012',
    payloadDigest,
    revokedAt: null,
    revokedByUserId: null,
    revocationReason: null,
    voidedAt: null,
    voidedByUserId: null,
    voidReason: null,
    createdAt: now,
  };
}

describe('ConsentTemplateService', () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: ConsentTemplateService;

  beforeEach(() => {
    repository = {
      findByIdInClinic: vi.fn(),
      findLatestByCode: vi.fn(),
      create: vi.fn(),
      updateDraft: vi.fn(),
    };
    audit = { record: vi.fn(async () => undefined) };
    service = new ConsentTemplateService(repository as never, audit as never);
  });

  it('never edits an activated immutable version', async () => {
    repository['findByIdInClinic']?.mockResolvedValue(template());
    await expect(
      service.updateDraft(CLINIC_ID, TEMPLATE_ID, { title: 'Changed' }, CONTEXT),
    ).rejects.toMatchObject({ code: 'CONSENT_TEMPLATE_NOT_DRAFT' });
    expect(repository['updateDraft']).not.toHaveBeenCalled();
  });

  it('creates the next sequential version as a separate draft', async () => {
    repository['findByIdInClinic']?.mockResolvedValue(template());
    repository['findLatestByCode']?.mockResolvedValue(template({ version: 4 }));
    repository['create']?.mockResolvedValue(
      template({ _id: new Types.ObjectId(), version: 5, status: CONSENT_TEMPLATE_STATUSES.DRAFT }),
    );
    const created = await service.createVersion(CLINIC_ID, TEMPLATE_ID, {}, CONTEXT);
    expect(created.version).toBe(5);
    expect(created.status).toBe('DRAFT');
    expect(repository['create']).toHaveBeenCalledWith(
      CLINIC_ID,
      expect.objectContaining({ code: 'ORTHO', title: 'Orthodontic consent' }),
      5,
      USER_ID,
    );
  });
});

describe('ConsentService evidence safeguards', () => {
  const signature = {
    content: Buffer.from('signed pixels'),
    originalFileName: 'signature.png',
    mimeType: 'image/png' as const,
    width: 320,
    height: 140,
  };
  const input = {
    templateId: TEMPLATE_ID,
    signerType: CONSENT_SIGNER_TYPES.PATIENT,
    guardianId: null,
    treatmentId: null,
    retentionPlanId: null,
    idempotencyKey: '12345678-1234-4234-9234-123456789012',
    acknowledgement: true,
  };

  function digestFor(signingInput = input): string {
    const signatureSha = createHash('sha256').update(signature.content).digest('hex');
    return createHash('sha256')
      .update(JSON.stringify({ patientId: PATIENT_ID, ...signingInput, signatureSha }), 'utf8')
      .digest('hex');
  }

  function makeService(options: {
    replay?: SignedConsentRecord | null;
    consent?: SignedConsentRecord | null;
    downloaded?: Buffer;
  } = {}) {
    const consents = {
      findByIdempotencyKey: vi.fn(async () => options.replay ?? null),
      findByIdInClinic: vi.fn(async () => options.consent ?? null),
    };
    const storage = {
      isEnabled: vi.fn(() => true),
      upload: vi.fn(),
      remove: vi.fn(),
      download: vi.fn(async () => options.downloaded ?? Buffer.from('pdf')),
    };
    const service = new ConsentService(
      consents as never,
      { findByIdInClinic: vi.fn(async () => template()) } as never,
      { findByIdInClinic: vi.fn(async () => ({ firstName: 'Nadia', lastName: 'Patient', birthDate: null })) } as never,
      {} as never,
      {} as never,
      { findById: vi.fn(async () => ({ name: 'Clinic', timezone: 'UTC', address: {}, phone: null, settings: {} })) } as never,
      { findById: vi.fn(async () => ({ firstName: 'Dr', lastName: 'Aymen', email: 'doctor@example.com' })) } as never,
      {} as never,
      {} as never,
      storage,
      { generate: vi.fn() },
      { record: vi.fn() } as never,
    );
    return { service, storage };
  }

  it('returns the original record for an exact idempotent replay without uploading again', async () => {
    const { service, storage } = makeService({ replay: signed(digestFor()) });
    const result = await service.sign(CLINIC_ID, PATIENT_ID, input, signature, CONTEXT);
    expect(result.consentRef).toBe('CNS-2026-000001');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for changed evidence', async () => {
    const { service } = makeService({ replay: signed('different-payload') });
    await expect(service.sign(CLINIC_ID, PATIENT_ID, input, signature, CONTEXT)).rejects.toMatchObject({
      code: 'CONSENT_IDEMPOTENCY_CONFLICT',
    });
  });

  it('requires a guardian when the patient is a minor', async () => {
    const { service } = makeService();
    const patients = { findByIdInClinic: vi.fn(async () => ({ firstName: 'Nadia', lastName: 'Patient', birthDate: new Date('2014-01-01') })) };
    Object.assign(service, { patients });
    await expect(
      service.preview(CLINIC_ID, PATIENT_ID, { templateId: TEMPLATE_ID, signerType: 'PATIENT' }, CONTEXT),
    ).rejects.toMatchObject({ code: 'CONSENT_GUARDIAN_REQUIRED' });
  });

  it('refuses to stream a finalized PDF whose SHA-256 no longer matches', async () => {
    const record = signed(digestFor());
    const { service } = makeService({ consent: record, downloaded: Buffer.from('tampered') });
    await expect(service.downloadPdf(CLINIC_ID, CONSENT_ID)).rejects.toMatchObject({
      code: 'CONSENT_ARTIFACT_INTEGRITY_FAILED',
    });
  });
});

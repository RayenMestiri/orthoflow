import type { FastifyReply, FastifyRequest } from 'fastify';
import { toPaginationParams } from '../../common/utils/pagination.js';
import {
  mutationContext,
  requireTenant,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../common/utils/request-context.js';
import { ok, paginated } from '../../common/utils/response.js';
import type {
  ConsentIdParam,
  ConsentListQuery,
  ConsentPatientIdParam,
  ConsentPreviewBody,
  ConsentReasonBody,
  ConsentTemplateIdParam,
  ConsentTemplateListQuery,
  CreateConsentTemplateBody,
  CreateConsentTemplateVersionBody,
  UpdateConsentTemplateBody,
} from './consent.schema.js';
import { consentService, consentTemplateService } from './consent.service.js';
import { parseConsentSigningUpload } from './consent.validation.js';

export async function listConsentTemplatesHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = validatedQuery<ConsentTemplateListQuery>(request);
  const pagination = toPaginationParams(query);
  const result = await consentTemplateService.list(
    requireTenant(request).clinicId,
    {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.code ? { code: query.code } : {}),
    },
    pagination,
  );
  return reply.send(paginated(result, pagination));
}

export async function createConsentTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const template = await consentTemplateService.create(
    requireTenant(request).clinicId,
    validatedBody<CreateConsentTemplateBody>(request),
    mutationContext(request),
  );
  return reply.status(201).send(ok(template));
}

export async function updateConsentTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const template = await consentTemplateService.updateDraft(
    requireTenant(request).clinicId,
    validatedParams<ConsentTemplateIdParam>(request).templateId,
    validatedBody<UpdateConsentTemplateBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(template));
}

export async function createConsentTemplateVersionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const template = await consentTemplateService.createVersion(
    requireTenant(request).clinicId,
    validatedParams<ConsentTemplateIdParam>(request).templateId,
    validatedBody<CreateConsentTemplateVersionBody>(request),
    mutationContext(request),
  );
  return reply.status(201).send(ok(template));
}

export async function activateConsentTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const template = await consentTemplateService.activate(
    requireTenant(request).clinicId,
    validatedParams<ConsentTemplateIdParam>(request).templateId,
    mutationContext(request),
  );
  return reply.send(ok(template));
}

export async function archiveConsentTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const template = await consentTemplateService.archive(
    requireTenant(request).clinicId,
    validatedParams<ConsentTemplateIdParam>(request).templateId,
    mutationContext(request),
  );
  return reply.send(ok(template));
}

export async function listPatientConsentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = validatedQuery<ConsentListQuery>(request);
  const pagination = toPaginationParams(query);
  const result = await consentService.listForPatient(
    requireTenant(request).clinicId,
    validatedParams<ConsentPatientIdParam>(request).patientId,
    pagination,
  );
  return reply.send(paginated(result, pagination));
}

export async function previewPatientConsentHandler(request: FastifyRequest, reply: FastifyReply) {
  const preview = await consentService.preview(
    requireTenant(request).clinicId,
    validatedParams<ConsentPatientIdParam>(request).patientId,
    validatedBody<ConsentPreviewBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(preview));
}

export async function signPatientConsentHandler(request: FastifyRequest, reply: FastifyReply) {
  const upload = await parseConsentSigningUpload(request);
  const consent = await consentService.sign(
    requireTenant(request).clinicId,
    validatedParams<ConsentPatientIdParam>(request).patientId,
    upload.input,
    upload.signature,
    mutationContext(request),
  );
  return reply.status(201).send(ok(consent));
}

export async function getConsentHandler(request: FastifyRequest, reply: FastifyReply) {
  const consent = await consentService.getById(
    requireTenant(request).clinicId,
    validatedParams<ConsentIdParam>(request).consentId,
  );
  return reply.send(ok(consent));
}

export async function downloadConsentPdfHandler(request: FastifyRequest, reply: FastifyReply) {
  const artifact = await consentService.downloadPdf(
    requireTenant(request).clinicId,
    validatedParams<ConsentIdParam>(request).consentId,
  );
  return reply
    .type('application/pdf')
    .header('Cache-Control', 'private, no-store')
    .header('Content-Disposition', `inline; filename="${artifact.fileName}"`)
    .send(artifact.content);
}

export async function revokeConsentHandler(request: FastifyRequest, reply: FastifyReply) {
  const consent = await consentService.revoke(
    requireTenant(request).clinicId,
    validatedParams<ConsentIdParam>(request).consentId,
    validatedBody<ConsentReasonBody>(request).reason,
    mutationContext(request),
  );
  return reply.send(ok(consent));
}

export async function voidConsentHandler(request: FastifyRequest, reply: FastifyReply) {
  const consent = await consentService.void(
    requireTenant(request).clinicId,
    validatedParams<ConsentIdParam>(request).consentId,
    validatedBody<ConsentReasonBody>(request).reason,
    mutationContext(request),
  );
  return reply.send(ok(consent));
}

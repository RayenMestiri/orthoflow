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
  ArchivePatientMediaBody,
  PatientMediaIdParam,
  PatientMediaListQuery,
  PatientMediaPatientIdParam,
  UpdatePatientMediaBody,
} from './patient-media.schema.js';
import type { PatientMediaMutationContext } from './patient-media.types.js';
import { patientMediaService } from './patient-media.service.js';
import { parsePatientMediaUpload } from './patient-media.validation.js';

export async function listPatientMediaHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = validatedQuery<PatientMediaListQuery>(request);
  const pagination = toPaginationParams(query);
  const result = await patientMediaService.listForPatient(
    requireTenant(request).clinicId,
    validatedParams<PatientMediaPatientIdParam>(request).patientId,
    {
      ...(query.category ? { category: query.category } : {}),
      ...(query.mediaType ? { mediaType: query.mediaType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.treatmentId ? { treatmentId: query.treatmentId } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
    },
    pagination,
  );
  return reply.send(paginated(result, pagination));
}

export async function uploadPatientMediaHandler(request: FastifyRequest, reply: FastifyReply) {
  const upload = await parsePatientMediaUpload(request);
  const media = await patientMediaService.upload(
    requireTenant(request).clinicId,
    validatedParams<PatientMediaPatientIdParam>(request).patientId,
    upload.file,
    upload.metadata,
    mediaMutationContext(request),
  );
  return reply.status(201).send(ok(media));
}

export async function getPatientMediaHandler(request: FastifyRequest, reply: FastifyReply) {
  const media = await patientMediaService.getById(
    requireTenant(request).clinicId,
    validatedParams<PatientMediaIdParam>(request).mediaId,
  );
  return reply.send(ok(media));
}

export async function updatePatientMediaHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = validatedBody<UpdatePatientMediaBody>(request);
  const media = await patientMediaService.update(
    requireTenant(request).clinicId,
    validatedParams<PatientMediaIdParam>(request).mediaId,
    {
      ...(body.category === undefined ? {} : { category: body.category }),
      ...(body.title === undefined ? {} : { title: body.title }),
      ...(body.description === undefined ? {} : { description: body.description }),
      ...(body.treatmentId === undefined ? {} : { treatmentId: body.treatmentId }),
      ...(body.capturedAt === undefined
        ? {}
        : { capturedAt: body.capturedAt ? new Date(body.capturedAt) : null }),
    },
    mediaMutationContext(request),
  );
  return reply.send(ok(media));
}

export async function archivePatientMediaHandler(request: FastifyRequest, reply: FastifyReply) {
  const media = await patientMediaService.archive(
    requireTenant(request).clinicId,
    validatedParams<PatientMediaIdParam>(request).mediaId,
    validatedBody<ArchivePatientMediaBody>(request).reason ?? null,
    mediaMutationContext(request),
  );
  return reply.send(ok(media));
}

function mediaMutationContext(request: FastifyRequest): PatientMediaMutationContext {
  return {
    ...mutationContext(request),
    clinicRole: requireTenant(request).role,
  };
}

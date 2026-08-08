import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  mutationContext,
  requireTenant,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../common/utils/request-context.js';
import { ok, paginated } from '../../common/utils/response.js';
import { treatmentService } from './treatment.service.js';
import type {
  CancelTreatmentBody,
  CompleteTreatmentBody,
  CreateTreatmentBody,
  CreateTreatmentProgressBody,
  PatientIdParam,
  PatientTreatmentsQuery,
  PauseTreatmentBody,
  ResumeTreatmentBody,
  StartTreatmentBody,
  TreatmentIdParam,
  TreatmentProgressQuery,
  UpdateTreatmentBody,
} from './treatment.schema.js';

/**
 * Thin HTTP adapter: read validated input, call a use case, shape the response.
 * No business rules, no database access, no try/catch — errors bubble to the
 * centralized handler.
 */

export async function listPatientTreatmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { status, includeProgress } = validatedQuery<PatientTreatmentsQuery>(request);

  const treatments = await treatmentService.listForPatient(
    requireTenant(request).clinicId,
    validatedParams<PatientIdParam>(request).patientId,
    {
      ...(status ? { status } : {}),
      ...(includeProgress === undefined ? {} : { includeProgress }),
    },
  );

  return reply.send(ok(treatments));
}

export async function createTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const treatment = await treatmentService.create(
    requireTenant(request).clinicId,
    validatedParams<PatientIdParam>(request).patientId,
    validatedBody<CreateTreatmentBody>(request),
    mutationContext(request),
  );
  return reply.status(201).send(ok(treatment));
}

export async function getTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const treatment = await treatmentService.getById(
    requireTenant(request).clinicId,
    validatedParams<TreatmentIdParam>(request).treatmentId,
  );
  return reply.send(ok(treatment));
}

export async function updateTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const treatment = await treatmentService.update(
    requireTenant(request).clinicId,
    validatedParams<TreatmentIdParam>(request).treatmentId,
    validatedBody<UpdateTreatmentBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(treatment));
}

export async function startTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const treatment = await treatmentService.start(
    requireTenant(request).clinicId,
    validatedParams<TreatmentIdParam>(request).treatmentId,
    validatedBody<StartTreatmentBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(treatment));
}

export async function pauseTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const treatment = await treatmentService.pause(
    requireTenant(request).clinicId,
    validatedParams<TreatmentIdParam>(request).treatmentId,
    validatedBody<PauseTreatmentBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(treatment));
}

export async function resumeTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const treatment = await treatmentService.resume(
    requireTenant(request).clinicId,
    validatedParams<TreatmentIdParam>(request).treatmentId,
    validatedBody<ResumeTreatmentBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(treatment));
}

export async function completeTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const treatment = await treatmentService.complete(
    requireTenant(request).clinicId,
    validatedParams<TreatmentIdParam>(request).treatmentId,
    validatedBody<CompleteTreatmentBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(treatment));
}

export async function cancelTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const treatment = await treatmentService.cancel(
    requireTenant(request).clinicId,
    validatedParams<TreatmentIdParam>(request).treatmentId,
    validatedBody<CancelTreatmentBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(treatment));
}

export async function listTreatmentProgressHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit } = validatedQuery<TreatmentProgressQuery>(request);
  const { result, pagination } = await treatmentService.listProgress(
    requireTenant(request).clinicId,
    validatedParams<TreatmentIdParam>(request).treatmentId,
    { page, limit },
  );
  return reply.send(paginated(result, pagination));
}

export async function createTreatmentProgressHandler(request: FastifyRequest, reply: FastifyReply) {
  const entry = await treatmentService.addProgress(
    requireTenant(request).clinicId,
    validatedParams<TreatmentIdParam>(request).treatmentId,
    validatedBody<CreateTreatmentProgressBody>(request),
    mutationContext(request),
  );
  return reply.status(201).send(ok(entry));
}

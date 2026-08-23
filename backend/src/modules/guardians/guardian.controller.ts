import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  mutationContext,
  requireTenant,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import type {
  CreateGuardianBody,
  GuardianSearchQuery,
  LinkExistingGuardianBody,
  PatientGuardianParam,
  PatientParam,
  UpdateGuardianBody,
} from './guardian.schema.js';
import { guardianService } from './guardian.service.js';

export async function listPatientGuardiansHandler(request: FastifyRequest, reply: FastifyReply) {
  const guardians = await guardianService.listForPatient(
    requireTenant(request).clinicId,
    validatedParams<PatientParam>(request).patientId,
  );
  return reply.send(ok(guardians));
}

export async function createPatientGuardianHandler(request: FastifyRequest, reply: FastifyReply) {
  const guardian = await guardianService.createForPatient(
    requireTenant(request).clinicId,
    validatedParams<PatientParam>(request).patientId,
    validatedBody<CreateGuardianBody>(request),
    mutationContext(request),
  );
  return reply.status(201).send(ok(guardian));
}

export async function linkExistingPatientGuardianHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const guardian = await guardianService.linkExistingToPatient(
    requireTenant(request).clinicId,
    validatedParams<PatientParam>(request).patientId,
    validatedBody<LinkExistingGuardianBody>(request),
    mutationContext(request),
  );
  return reply.status(201).send(ok(guardian));
}

export async function updatePatientGuardianHandler(request: FastifyRequest, reply: FastifyReply) {
  const { patientId, guardianId } = validatedParams<PatientGuardianParam>(request);
  const guardian = await guardianService.updateForPatient(
    requireTenant(request).clinicId,
    patientId,
    guardianId,
    validatedBody<UpdateGuardianBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(guardian));
}

export async function makePrimaryPatientGuardianHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { patientId, guardianId } = validatedParams<PatientGuardianParam>(request);
  const guardian = await guardianService.makePrimary(
    requireTenant(request).clinicId,
    patientId,
    guardianId,
    mutationContext(request),
  );
  return reply.send(ok(guardian));
}

export async function unlinkPatientGuardianHandler(request: FastifyRequest, reply: FastifyReply) {
  const { patientId, guardianId } = validatedParams<PatientGuardianParam>(request);
  await guardianService.unlinkFromPatient(
    requireTenant(request).clinicId,
    patientId,
    guardianId,
    mutationContext(request),
  );
  return reply.send(ok({ unlinked: true }));
}

export async function getGuardianChildrenHandler(request: FastifyRequest, reply: FastifyReply) {
  const { guardianId } = validatedParams<{ guardianId: string }>(request);
  const children = await guardianService.getGuardianChildren(
    requireTenant(request).clinicId,
    guardianId,
  );
  return reply.send(ok(children));
}

export async function searchGuardiansHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = validatedQuery<GuardianSearchQuery>(request).query ?? '';
  const results = await guardianService.searchGuardians(requireTenant(request).clinicId, query);
  return reply.send(ok(results));
}


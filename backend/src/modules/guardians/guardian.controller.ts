import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  mutationContext,
  requireTenant,
  validatedBody,
  validatedParams,
} from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import type {
  CreateGuardianBody,
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

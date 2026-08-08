import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  mutationContext,
  requireTenant,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../common/utils/request-context.js';
import { ok, paginated } from '../../common/utils/response.js';
import { patientService } from './patient.service.js';
import type {
  CreatePatientBody,
  PatientIdParam,
  PatientListQuery,
  UpdatePatientBody,
} from './patient.schema.js';

/**
 * Thin HTTP adapter: read validated input, call a use case, shape the response.
 * No business rules, no database access, no try/catch — errors bubble to the
 * centralized handler.
 */

export async function listPatientsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit, status, search, sortBy, sortOrder } =
    validatedQuery<PatientListQuery>(request);

  const { result, pagination } = await patientService.list(
    requireTenant(request).clinicId,
    {
      ...(status ? { status } : {}),
      ...(search ? { search } : {}),
      ...(sortBy ? { sortBy } : {}),
      ...(sortOrder ? { sortOrder } : {}),
    },
    { page, limit },
  );

  return reply.send(paginated(result, pagination));
}

export async function getPatientActivityHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit } = validatedQuery<PatientListQuery>(request);
  const { result, pagination } = await patientService.getActivity(
    requireTenant(request).clinicId,
    validatedParams<PatientIdParam>(request).patientId,
    { page, limit },
  );
  return reply.send(paginated(result, pagination));
}

export async function getPatientHandler(request: FastifyRequest, reply: FastifyReply) {
  const patient = await patientService.getById(
    requireTenant(request).clinicId,
    validatedParams<PatientIdParam>(request).patientId,
  );
  return reply.send(ok(patient));
}

export async function createPatientHandler(request: FastifyRequest, reply: FastifyReply) {
  const patient = await patientService.create(
    requireTenant(request).clinicId,
    validatedBody<CreatePatientBody>(request),
    mutationContext(request),
  );
  return reply.status(201).send(ok(patient));
}

export async function updatePatientHandler(request: FastifyRequest, reply: FastifyReply) {
  const patient = await patientService.update(
    requireTenant(request).clinicId,
    validatedParams<PatientIdParam>(request).patientId,
    validatedBody<UpdatePatientBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(patient));
}

export async function archivePatientHandler(request: FastifyRequest, reply: FastifyReply) {
  const patient = await patientService.archive(
    requireTenant(request).clinicId,
    validatedParams<PatientIdParam>(request).patientId,
    mutationContext(request),
  );
  return reply.send(ok(patient));
}

export async function restorePatientHandler(request: FastifyRequest, reply: FastifyReply) {
  const patient = await patientService.restore(
    requireTenant(request).clinicId,
    validatedParams<PatientIdParam>(request).patientId,
    mutationContext(request),
  );
  return reply.send(ok(patient));
}

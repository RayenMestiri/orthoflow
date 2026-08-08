import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  mutationContext,
  requireAuthUser,
  requireTenant,
  validatedBody,
} from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import { clinicService } from './clinic.service.js';
import type { UpdateClinicBody } from './clinic.schema.js';

export async function listMyClinicsHandler(request: FastifyRequest, reply: FastifyReply) {
  const clinics = await clinicService.listForUser(requireAuthUser(request));
  return reply.send(ok(clinics));
}

export async function getClinicHandler(request: FastifyRequest, reply: FastifyReply) {
  // The id comes from the verified tenant context, not from the raw URL param —
  // by this point `requireClinic` has proven the caller may work in this clinic.
  const clinic = await clinicService.getById(requireTenant(request).clinicId);
  return reply.send(ok(clinic));
}

export async function updateClinicHandler(request: FastifyRequest, reply: FastifyReply) {
  const clinic = await clinicService.update(
    requireTenant(request).clinicId,
    validatedBody<UpdateClinicBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(clinic));
}

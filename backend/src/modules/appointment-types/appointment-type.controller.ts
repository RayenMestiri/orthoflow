import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  mutationContext,
  requireTenant,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import { appointmentTypeService } from './appointment-type.service.js';
import type {
  AppointmentTypeIdParam,
  AppointmentTypeListQuery,
  CreateAppointmentTypeBody,
  UpdateAppointmentTypeBody,
} from './appointment-type.schema.js';

export async function listAppointmentTypesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { includeInactive } = validatedQuery<AppointmentTypeListQuery>(request);
  const types = await appointmentTypeService.list(requireTenant(request).clinicId, includeInactive);
  return reply.send(ok(types));
}

export async function createAppointmentTypeHandler(request: FastifyRequest, reply: FastifyReply) {
  const type = await appointmentTypeService.create(
    requireTenant(request).clinicId,
    validatedBody<CreateAppointmentTypeBody>(request),
    mutationContext(request),
  );
  return reply.status(201).send(ok(type));
}

export async function updateAppointmentTypeHandler(request: FastifyRequest, reply: FastifyReply) {
  const type = await appointmentTypeService.update(
    requireTenant(request).clinicId,
    validatedParams<AppointmentTypeIdParam>(request).appointmentTypeId,
    validatedBody<UpdateAppointmentTypeBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(type));
}

import type { FastifyReply, FastifyRequest } from 'fastify';
import { mutationContext, requireTenant, validatedBody } from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import { clinicSettingsService } from './clinic-settings.service.js';
import type {
  UpdateGeneralSettingsBody,
  UpdateCareContinuitySettingsBody,
  UpdateSchedulingSettingsBody,
  UpdateWorkingHoursBody,
} from './clinic-settings.schema.js';

/**
 * Thin HTTP adapter. The clinic always comes from the verified tenant context,
 * never from the payload or the query string.
 */

export async function getClinicSettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const settings = await clinicSettingsService.get(requireTenant(request).clinicId);
  return reply.send(ok(settings));
}

export async function updateGeneralSettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const settings = await clinicSettingsService.updateGeneral(
    requireTenant(request).clinicId,
    validatedBody<UpdateGeneralSettingsBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(settings));
}

export async function updateWorkingHoursHandler(request: FastifyRequest, reply: FastifyReply) {
  const settings = await clinicSettingsService.updateWorkingHours(
    requireTenant(request).clinicId,
    validatedBody<UpdateWorkingHoursBody>(request).workingHours,
    mutationContext(request),
  );
  return reply.send(ok(settings));
}

export async function updateSchedulingSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const settings = await clinicSettingsService.updateScheduling(
    requireTenant(request).clinicId,
    validatedBody<UpdateSchedulingSettingsBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(settings));
}

export async function updateCareContinuitySettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const settings = await clinicSettingsService.updateCareContinuity(
    requireTenant(request).clinicId,
    validatedBody<UpdateCareContinuitySettingsBody>(request),
    mutationContext(request),
  );
  return reply.send(ok(settings));
}

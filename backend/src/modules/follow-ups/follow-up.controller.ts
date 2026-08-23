import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireTenant, validatedQuery } from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import { followUpService } from './follow-up.service.js';
import { careContinuityService } from './care-continuity.service.js';
import type { CareContinuityQueryInput, FollowUpQueryInput } from './follow-up.schema.js';

export async function listFollowUpsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit, filter, sort, search, patientId, treatmentId } =
    validatedQuery<FollowUpQueryInput>(request);
  const result = await followUpService.list(
    requireTenant(request).clinicId,
    {
      filter,
      sort,
      ...(search ? { search } : {}),
      ...(patientId ? { patientId } : {}),
      ...(treatmentId ? { treatmentId } : {}),
    },
    { page, limit },
  );
  return reply.send(ok(result));
}

export async function listCareContinuityHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit, state, search } = validatedQuery<CareContinuityQueryInput>(request);
  const result = await careContinuityService.list(
    requireTenant(request).clinicId,
    { ...(state ? { state } : {}), ...(search ? { search } : {}) },
    { page, limit },
  );
  return reply.send(ok(result));
}

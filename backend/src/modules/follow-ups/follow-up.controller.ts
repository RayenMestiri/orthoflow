import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireTenant, validatedQuery } from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import { followUpService } from './follow-up.service.js';
import type { FollowUpQueryInput } from './follow-up.schema.js';

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

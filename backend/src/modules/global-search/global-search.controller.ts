import type { FastifyReply, FastifyRequest } from 'fastify';
import { PERMISSIONS, ROLE_PERMISSIONS, type Permission } from '../../common/constants/permissions.js';
import { requireTenant, validatedQuery } from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import type { GlobalSearchQueryInput } from './global-search.schema.js';
import { globalSearchService } from './global-search.service.js';

export async function globalSearchHandler(request: FastifyRequest, reply: FastifyReply) {
  const tenant = requireTenant(request);
  const query = validatedQuery<GlobalSearchQueryInput>(request);

  let permissions: readonly Permission[] = [];
  if (tenant.isPlatformAdmin) {
    permissions = Object.values(PERMISSIONS);
  } else if (tenant.role) {
    permissions = ROLE_PERMISSIONS[tenant.role] ?? [];
  }

  try {
    const results = await globalSearchService.search(
      tenant.clinicId,
      query.q,
      query.limit,
      permissions,
    );

    return reply.send(ok(results));
  } catch (err) {
    request.log.error(err, 'Global search failed');
    console.error('GLOBAL SEARCH HANDLER ERROR:', err);
    throw err;
  }
}

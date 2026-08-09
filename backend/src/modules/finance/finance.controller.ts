import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireTenant, validatedQuery } from '../../common/utils/request-context.js';
import { ok, paginated } from '../../common/utils/response.js';
import { financeService } from './finance.service.js';
import type {
  FinanceActivityQueryInput,
  PatientBalanceQueryInput,
} from './finance.schema.js';

/** Thin HTTP adapter: read validated input, call one use case, shape the reply. */

export async function getFinanceOverviewHandler(request: FastifyRequest, reply: FastifyReply) {
  const overview = await financeService.getOverview(requireTenant(request).clinicId);
  return reply.send(ok(overview));
}

export async function listPatientBalancesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit, filter, sort, search } = validatedQuery<PatientBalanceQueryInput>(request);

  const { result, pagination } = await financeService.listPatientBalances(
    requireTenant(request).clinicId,
    { filter, sort, ...(search ? { search } : {}) },
    { page, limit },
  );

  return reply.send(paginated(result, pagination));
}

export async function listFinanceActivityHandler(request: FastifyRequest, reply: FastifyReply) {
  const { limit } = validatedQuery<FinanceActivityQueryInput>(request);
  const activity = await financeService.listRecentActivity(
    requireTenant(request).clinicId,
    limit,
  );
  return reply.send(ok(activity));
}

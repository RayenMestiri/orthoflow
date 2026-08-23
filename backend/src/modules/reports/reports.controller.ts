import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireTenant, validatedQuery } from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import type { ReportQueryInput } from './reports.schema.js';
import { reportsService } from './reports.service.js';

function query(request: FastifyRequest): ReportQueryInput {
  return validatedQuery<ReportQueryInput>(request);
}

export async function getReportOverviewHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(ok(await reportsService.overview(requireTenant(request).clinicId, query(request))));
}

export async function getAppointmentReportsHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(await reportsService.appointments(requireTenant(request).clinicId, query(request))),
  );
}

export async function getTreatmentRetentionReportsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  return reply.send(
    ok(await reportsService.treatmentsRetention(requireTenant(request).clinicId, query(request))),
  );
}

export async function getFinanceReportsHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(await reportsService.financeReport(requireTenant(request).clinicId, query(request))),
  );
}

export async function getCareContinuityReportsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  return reply.send(ok(await reportsService.careContinuity(requireTenant(request).clinicId)));
}

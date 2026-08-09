import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasPermission } from '../../common/authorization/policy.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  mutationContext,
  requireTenant,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../common/utils/request-context.js';
import { ok, paginated } from '../../common/utils/response.js';
import { cashRecordService, type FinancialActorContext } from './cash-record.service.js';
import type {
  CancelCashRecordBody,
  CashRecordIdParam,
  CashRecordListQuery,
  PatientIdParam,
  RecordPaymentBody,
  TreatmentIdParam,
} from './cash-record.schema.js';

/**
 * Thin HTTP adapter: read validated input, call a use case, shape the response.
 * No business rules, no database access, no try/catch.
 */

/**
 * Resolves the actor plus the one authorization fact the service needs.
 *
 * The overpayment decision has to be made server-side, but the service must not
 * import Fastify — so the permission is evaluated here, from the verified
 * tenant context, and passed down as data. A client cannot forge it.
 */
function financialContext(request: FastifyRequest): FinancialActorContext {
  return {
    ...mutationContext(request),
    canApproveOverpayment: hasPermission(
      requireTenant(request),
      PERMISSIONS.CASH_RECORD_APPROVE_OVERPAYMENT,
    ),
  };
}

export async function listPatientCashRecordsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit, status, treatmentId, from, to } =
    validatedQuery<CashRecordListQuery>(request);

  const { result, pagination } = await cashRecordService.listForPatient(
    requireTenant(request).clinicId,
    validatedParams<PatientIdParam>(request).patientId,
    {
      ...(status ? { status } : {}),
      ...(treatmentId ? { treatmentId } : {}),
      ...(from ? { from: new Date(from) } : {}),
      ...(to ? { to: new Date(to) } : {}),
    },
    { page, limit },
  );

  return reply.send(paginated(result, pagination));
}

export async function recordPaymentHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = validatedBody<RecordPaymentBody>(request);

  const record = await cashRecordService.record(
    requireTenant(request).clinicId,
    {
      ...body,
      patientId: validatedParams<PatientIdParam>(request).patientId,
    },
    financialContext(request),
  );

  return reply.status(201).send(ok(record));
}

export async function getCashRecordHandler(request: FastifyRequest, reply: FastifyReply) {
  const record = await cashRecordService.getById(
    requireTenant(request).clinicId,
    validatedParams<CashRecordIdParam>(request).cashRecordId,
  );
  return reply.send(ok(record));
}

export async function cancelCashRecordHandler(request: FastifyRequest, reply: FastifyReply) {
  const record = await cashRecordService.cancel(
    requireTenant(request).clinicId,
    validatedParams<CashRecordIdParam>(request).cashRecordId,
    validatedBody<CancelCashRecordBody>(request).reason,
    mutationContext(request),
  );
  return reply.send(ok(record));
}

export async function getPatientFinancialSummaryHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const summary = await cashRecordService.summaryForPatient(
    requireTenant(request).clinicId,
    validatedParams<PatientIdParam>(request).patientId,
  );
  return reply.send(ok(summary));
}

export async function getTreatmentFinancialSummaryHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const summary = await cashRecordService.summaryForTreatment(
    requireTenant(request).clinicId,
    validatedParams<TreatmentIdParam>(request).treatmentId,
  );
  return reply.send(ok(summary));
}

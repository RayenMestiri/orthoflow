import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireTenant, validatedParams } from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import type { CashRecordIdParam } from '../cash-records/cash-record.schema.js';
import type { ReceiptIdParam } from './receipt.schema.js';
import { receiptService } from './receipt.service.js';

export async function getReceiptForCashRecordHandler(request: FastifyRequest, reply: FastifyReply) {
  const receipt = await receiptService.getByCashRecord(
    requireTenant(request).clinicId,
    validatedParams<CashRecordIdParam>(request).cashRecordId,
  );
  return reply.send(ok(receipt));
}

export async function getReceiptHandler(request: FastifyRequest, reply: FastifyReply) {
  const receipt = await receiptService.getById(
    requireTenant(request).clinicId,
    validatedParams<ReceiptIdParam>(request).receiptId,
  );
  return reply.send(ok(receipt));
}

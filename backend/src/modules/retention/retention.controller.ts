import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasPermission } from '../../common/authorization/policy.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  mutationContext,
  requireTenant,
  validatedBody,
  validatedParams,
} from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import type {
  CloseRetentionBody,
  CreateRetentionBody,
  PatientRetentionParam,
  RetainerParam,
  RetainerWriteBody,
  RetentionPlanParam,
  TreatmentRetentionParam,
  UpdateRetentionBody,
} from './retention.schema.js';
import { retentionService } from './retention.service.js';
import type { RetainerDeviceInput } from './retention.types.js';

function includePrivate(request: FastifyRequest): boolean {
  return hasPermission(requireTenant(request), PERMISSIONS.RETENTION_MANAGE);
}

function retainerInput(body: RetainerWriteBody): RetainerDeviceInput {
  return {
    type: body.type,
    arch: body.arch,
    ...(body.customTypeLabel === undefined ? {} : { customTypeLabel: body.customTypeLabel }),
    ...(body.notes === undefined ? {} : { notes: body.notes }),
    ...(body.deliveredAt ? { deliveredAt: new Date(body.deliveredAt) } : {}),
  };
}

export async function listPatientRetentionHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(
      await retentionService.listForPatient(
        requireTenant(request),
        validatedParams<PatientRetentionParam>(request).patientId,
        includePrivate(request),
      ),
    ),
  );
}

export async function getTreatmentRetentionHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(
      await retentionService.getByTreatment(
        requireTenant(request),
        validatedParams<TreatmentRetentionParam>(request).treatmentId,
        includePrivate(request),
      ),
    ),
  );
}

export async function createRetentionHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = validatedBody<CreateRetentionBody>(request);
  const created = await retentionService.create(
    requireTenant(request),
    validatedParams<TreatmentRetentionParam>(request).treatmentId,
    {
      initialControlRecommendedAt: body.initialControlRecommendedAt
        ? new Date(body.initialControlRecommendedAt)
        : null,
      notes: body.notes ?? null,
      retainers: body.retainers.map(retainerInput),
    },
    mutationContext(request),
  );
  return reply.status(201).send(ok(created));
}

export async function updateRetentionHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = validatedBody<UpdateRetentionBody>(request);
  return reply.send(
    ok(
      await retentionService.update(
        requireTenant(request),
        validatedParams<RetentionPlanParam>(request).retentionPlanId,
        {
          ...(body.initialControlRecommendedAt === undefined
            ? {}
            : {
                initialControlRecommendedAt: body.initialControlRecommendedAt
                  ? new Date(body.initialControlRecommendedAt)
                  : null,
              }),
          ...(body.notes === undefined ? {} : { notes: body.notes }),
        },
        mutationContext(request),
      ),
    ),
  );
}

export async function deliverRetainerHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(201).send(
    ok(
      await retentionService.deliver(
        requireTenant(request),
        validatedParams<RetentionPlanParam>(request).retentionPlanId,
        retainerInput(validatedBody<RetainerWriteBody>(request)),
        mutationContext(request),
      ),
    ),
  );
}

export async function replaceRetainerHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = validatedParams<RetainerParam>(request);
  return reply.send(
    ok(
      await retentionService.replace(
        requireTenant(request),
        params.retentionPlanId,
        params.retainerId,
        retainerInput(validatedBody<RetainerWriteBody>(request)),
        mutationContext(request),
      ),
    ),
  );
}

export async function markRetainerLostHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = validatedParams<RetainerParam>(request);
  return reply.send(
    ok(
      await retentionService.markDevice(
        requireTenant(request),
        params.retentionPlanId,
        params.retainerId,
        'LOST',
        mutationContext(request),
      ),
    ),
  );
}

export async function discontinueRetainerHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = validatedParams<RetainerParam>(request);
  return reply.send(
    ok(
      await retentionService.markDevice(
        requireTenant(request),
        params.retentionPlanId,
        params.retainerId,
        'DISCONTINUED',
        mutationContext(request),
      ),
    ),
  );
}

async function close(
  request: FastifyRequest,
  reply: FastifyReply,
  target: 'COMPLETED' | 'CANCELLED',
) {
  const body = validatedBody<CloseRetentionBody>(request);
  return reply.send(
    ok(
      await retentionService.close(
        requireTenant(request),
        validatedParams<RetentionPlanParam>(request).retentionPlanId,
        target,
        body.reason ?? null,
        mutationContext(request),
      ),
    ),
  );
}

export const completeRetentionHandler = (request: FastifyRequest, reply: FastifyReply) =>
  close(request, reply, 'COMPLETED');
export const cancelRetentionHandler = (request: FastifyRequest, reply: FastifyReply) =>
  close(request, reply, 'CANCELLED');

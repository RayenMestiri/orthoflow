import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  mutationContext,
  requireTenant,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../common/utils/request-context.js';
import { ok, paginated } from '../../common/utils/response.js';
import { treatmentService } from './treatment.service.js';
import type {
  CancelTreatmentBody,
  CompleteTreatmentBody,
  CreateTreatmentBody,
  CreateTreatmentMilestoneBody,
  PatientIdParam,
  PatientTreatmentsQuery,
  PauseTreatmentBody,
  ResumeTreatmentBody,
  StartTreatmentBody,
  TreatmentIdParam,
  TreatmentMilestoneIdParam,
  TreatmentMilestonesQuery,
  UpdateTreatmentBody,
  UpdateTreatmentMilestoneBody,
} from './treatment.schema.js';

export async function listPatientTreatmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { status, includeMilestones } = validatedQuery<PatientTreatmentsQuery>(request);
  const treatments = await treatmentService.listForPatient(
    requireTenant(request).clinicId,
    validatedParams<PatientIdParam>(request).patientId,
    {
      ...(status ? { status } : {}),
      ...(includeMilestones === undefined ? {} : { includeMilestones }),
    },
  );
  return reply.send(ok(treatments));
}

export async function createTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const treatment = await treatmentService.create(
    requireTenant(request).clinicId,
    validatedParams<PatientIdParam>(request).patientId,
    validatedBody<CreateTreatmentBody>(request),
    mutationContext(request),
  );
  return reply.status(201).send(ok(treatment));
}

export async function getTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(
      await treatmentService.getById(
        requireTenant(request).clinicId,
        validatedParams<TreatmentIdParam>(request).treatmentId,
      ),
    ),
  );
}

export async function updateTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(
      await treatmentService.update(
        requireTenant(request).clinicId,
        validatedParams<TreatmentIdParam>(request).treatmentId,
        validatedBody<UpdateTreatmentBody>(request),
        mutationContext(request),
      ),
    ),
  );
}

export async function startTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(
      await treatmentService.start(
        requireTenant(request).clinicId,
        validatedParams<TreatmentIdParam>(request).treatmentId,
        validatedBody<StartTreatmentBody>(request),
        mutationContext(request),
      ),
    ),
  );
}

export async function pauseTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(
      await treatmentService.pause(
        requireTenant(request).clinicId,
        validatedParams<TreatmentIdParam>(request).treatmentId,
        validatedBody<PauseTreatmentBody>(request),
        mutationContext(request),
      ),
    ),
  );
}

export async function resumeTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(
      await treatmentService.resume(
        requireTenant(request).clinicId,
        validatedParams<TreatmentIdParam>(request).treatmentId,
        validatedBody<ResumeTreatmentBody>(request),
        mutationContext(request),
      ),
    ),
  );
}

export async function completeTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(
      await treatmentService.complete(
        requireTenant(request).clinicId,
        validatedParams<TreatmentIdParam>(request).treatmentId,
        validatedBody<CompleteTreatmentBody>(request),
        mutationContext(request),
      ),
    ),
  );
}

export async function cancelTreatmentHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(
      await treatmentService.cancel(
        requireTenant(request).clinicId,
        validatedParams<TreatmentIdParam>(request).treatmentId,
        validatedBody<CancelTreatmentBody>(request),
        mutationContext(request),
      ),
    ),
  );
}

export async function listTreatmentMilestonesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit } = validatedQuery<TreatmentMilestonesQuery>(request);
  const { result, pagination } = await treatmentService.listMilestones(
    requireTenant(request).clinicId,
    validatedParams<TreatmentIdParam>(request).treatmentId,
    { page, limit },
  );
  return reply.send(paginated(result, pagination));
}

export async function createTreatmentMilestoneHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const milestone = await treatmentService.addMilestone(
    requireTenant(request).clinicId,
    validatedParams<TreatmentIdParam>(request).treatmentId,
    validatedBody<CreateTreatmentMilestoneBody>(request),
    mutationContext(request),
  );
  return reply.status(201).send(ok(milestone));
}

export async function updateTreatmentMilestoneHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const params = validatedParams<TreatmentMilestoneIdParam>(request);
  return reply.send(
    ok(
      await treatmentService.updateMilestone(
        requireTenant(request).clinicId,
        params.treatmentId,
        params.milestoneId,
        validatedBody<UpdateTreatmentMilestoneBody>(request),
        mutationContext(request),
      ),
    ),
  );
}

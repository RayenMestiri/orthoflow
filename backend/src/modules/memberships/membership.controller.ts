import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  mutationContext,
  requireTenant,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../common/utils/request-context.js';
import { ok, paginated } from '../../common/utils/response.js';
import { membershipService } from './membership.service.js';
import type {
  AddMemberBody,
  MembershipListQuery,
  MembershipParams,
  UpdateMemberBody,
} from './membership.schema.js';

export async function listMembersHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit, status, role } = validatedQuery<MembershipListQuery>(request);

  const { result, pagination } = await membershipService.list(
    requireTenant(request).clinicId,
    { ...(status ? { status } : {}), ...(role ? { role } : {}) },
    { page, limit },
  );

  return reply.send(paginated(result, pagination));
}

export async function addMemberHandler(request: FastifyRequest, reply: FastifyReply) {
  const membership = await membershipService.addMember(
    requireTenant(request).clinicId,
    validatedBody<AddMemberBody>(request),
    mutationContext(request),
  );

  return reply.status(201).send(ok(membership));
}

export async function updateMemberHandler(request: FastifyRequest, reply: FastifyReply) {
  const membership = await membershipService.updateMember(
    requireTenant(request).clinicId,
    validatedParams<MembershipParams>(request).membershipId,
    validatedBody<UpdateMemberBody>(request),
    mutationContext(request),
  );

  return reply.send(ok(membership));
}

export async function removeMemberHandler(request: FastifyRequest, reply: FastifyReply) {
  const membership = await membershipService.removeMember(
    requireTenant(request).clinicId,
    validatedParams<MembershipParams>(request).membershipId,
    mutationContext(request),
  );

  return reply.send(ok(membership));
}

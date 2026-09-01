import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import {
  mutationContext,
  requireTenant,
  validatedBody,
  validatedParams,
} from '../../common/utils/request-context.js';
import { ok } from '../../common/utils/response.js';
import { portalAuthService } from './portal-auth.service.js';
import { portalReadService } from './portal-read.service.js';
import { portalManagementService } from './portal-management.service.js';
import type {
  PortalChildParam,
  PortalConsentParam,
  PortalDocumentParam,
  PortalGuardianParam,
  PortalReceiptParam,
  PortalRevokeBody,
  PortalShareBody,
} from './portal.schema.js';

function portal(request: FastifyRequest) {
  if (!request.portalUser) throw new UnauthorizedError('Portal authentication required');
  return request.portalUser;
}
export async function getPortalDashboardHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(ok(await portalReadService.dashboard(portal(request))));
}
export async function listPortalChildrenHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(ok(await portalReadService.children(portal(request))));
}
export async function listAllPortalConsentsHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(ok(await portalReadService.allConsents(portal(request))));
}
export async function getPortalChildOverviewHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(
      await portalReadService.overview(
        portal(request),
        validatedParams<PortalChildParam>(request).patientId,
      ),
    ),
  );
}
export async function listPortalAppointmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(ok(await portalReadService.appointments(portal(request))));
}
export async function getPortalFinanceHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(
      await portalReadService.finance(
        portal(request),
        validatedParams<PortalChildParam>(request).patientId,
      ),
    ),
  );
}
export async function getPortalReceiptHandler(request: FastifyRequest, reply: FastifyReply) {
  const p = validatedParams<PortalReceiptParam>(request);
  return reply.send(ok(await portalReadService.receipt(portal(request), p.patientId, p.receiptId)));
}
export async function listPortalDocumentsHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(ok(await portalReadService.documents(portal(request))));
}
export async function downloadPortalDocumentHandler(request: FastifyRequest, reply: FastifyReply) {
  const p = validatedParams<PortalDocumentParam>(request);
  const file = await portalReadService.downloadDocument(portal(request), p.patientId, p.documentId);
  return reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `attachment; filename="${file.fileName}"`)
    .send(file.content);
}
export async function listPortalConsentsHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(
    ok(
      await portalReadService.consents(
        portal(request),
        validatedParams<PortalChildParam>(request).patientId,
      ),
    ),
  );
}
export async function downloadPortalConsentHandler(request: FastifyRequest, reply: FastifyReply) {
  const p = validatedParams<PortalConsentParam>(request);
  const file = await portalReadService.downloadConsent(portal(request), p.patientId, p.consentId);
  return reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `attachment; filename="${file.fileName}"`)
    .send(file.content);
}

export async function getPortalAccessStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const p = validatedParams<PortalGuardianParam>(request);
  return reply.send(
    ok(await portalAuthService.status(requireTenant(request).clinicId, p.guardianId)),
  );
}
export async function invitePortalAccessHandler(request: FastifyRequest, reply: FastifyReply) {
  const p = validatedParams<PortalGuardianParam>(request);
  const ctx = mutationContext(request);
  return reply
    .status(201)
    .send(
      ok(
        await portalAuthService.invite(
          requireTenant(request).clinicId,
          p.guardianId,
          ctx.actorUserId,
        ),
      ),
    );
}
export async function revokePortalAccessHandler(request: FastifyRequest, reply: FastifyReply) {
  const p = validatedParams<PortalGuardianParam>(request);
  const ctx = mutationContext(request);
  await portalAuthService.revoke(
    requireTenant(request).clinicId,
    p.guardianId,
    ctx.actorUserId,
    validatedBody<PortalRevokeBody>(request).reason,
  );
  return reply.send(ok({ revoked: true as const }));
}
export async function sharePortalDocumentHandler(request: FastifyRequest, reply: FastifyReply) {
  const ctx = mutationContext(request);
  const documentId = (request.params as { documentId: string }).documentId;
  return reply
    .status(201)
    .send(
      ok(
        await portalManagementService.shareDocument(
          requireTenant(request).clinicId,
          documentId,
          validatedBody<PortalShareBody>(request).guardianId,
          ctx.actorUserId,
        ),
      ),
    );
}
export async function revokePortalDocumentHandler(request: FastifyRequest, reply: FastifyReply) {
  const ctx = mutationContext(request);
  const params = request.params as { documentId: string; guardianId: string };
  await portalManagementService.revokeDocument(
    requireTenant(request).clinicId,
    params.documentId,
    params.guardianId,
    ctx.actorUserId,
  );
  return reply.send(ok({ revoked: true as const }));
}

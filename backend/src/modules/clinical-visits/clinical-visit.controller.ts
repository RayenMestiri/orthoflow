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
import type {
  AppointmentVisitParam,
  ClinicalVisitWriteBody,
  PatientVisitParam,
  PatientVisitsQuery,
  VisitIdParam,
} from './clinical-visit.schema.js';
import { clinicalVisitService } from './clinical-visit.service.js';

function actorContext(request: FastifyRequest) {
  const tenant = requireTenant(request);
  return {
    ...mutationContext(request),
    canEditCompleted: hasPermission(tenant, PERMISSIONS.CLINICAL_VISIT_EDIT_COMPLETED),
    canCompleteAppointment: hasPermission(tenant, PERMISSIONS.APPOINTMENT_COMPLETE_VISIT),
  };
}

export async function ensureAppointmentVisitHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await clinicalVisitService.ensureForAppointment(
    requireTenant(request).clinicId,
    validatedParams<AppointmentVisitParam>(request).appointmentId,
    mutationContext(request),
  );
  return reply.send(ok(result));
}

export async function getAppointmentVisitHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(ok(await clinicalVisitService.getByAppointment(
    requireTenant(request).clinicId,
    validatedParams<AppointmentVisitParam>(request).appointmentId,
  )));
}

export async function getClinicalVisitHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(ok(await clinicalVisitService.getById(
    requireTenant(request).clinicId,
    validatedParams<VisitIdParam>(request).visitId,
  )));
}

export async function listPatientClinicalVisitsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = validatedQuery<PatientVisitsQuery>(request);
  const { result, pagination } = await clinicalVisitService.listForPatient(
    requireTenant(request).clinicId,
    validatedParams<PatientVisitParam>(request).patientId,
    query,
  );
  return reply.send(paginated(result, pagination));
}

export async function updateClinicalVisitHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(ok(await clinicalVisitService.update(
    requireTenant(request).clinicId,
    validatedParams<VisitIdParam>(request).visitId,
    validatedBody<ClinicalVisitWriteBody>(request),
    actorContext(request),
  )));
}

export async function completeClinicalVisitHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(ok(await clinicalVisitService.complete(
    requireTenant(request).clinicId,
    validatedParams<VisitIdParam>(request).visitId,
    validatedBody<ClinicalVisitWriteBody>(request),
    actorContext(request),
  )));
}

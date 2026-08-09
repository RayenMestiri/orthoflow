import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  mutationContext,
  requireTenant,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../common/utils/request-context.js';
import { ok, paginated } from '../../common/utils/response.js';
import { hasPermission } from '../../common/authorization/policy.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { appointmentService } from './appointment.service.js';
import type {
  AppointmentIdParam,
  AppointmentActivityQuery,
  AppointmentListQuery,
  CancelAppointmentBody,
  ChangeStatusBody,
  CreateAppointmentBody,
  UpdateAppointmentBody,
} from './appointment.schema.js';

export async function listAppointmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = validatedQuery<AppointmentListQuery>(request);

  const appointments = await appointmentService.listInRange(requireTenant(request).clinicId, {
    start: new Date(query.start),
    end: new Date(query.end),
    ...(query.status ? { status: query.status } : {}),
    ...(query.patientId ? { patientId: query.patientId } : {}),
  });

  return reply.send(ok(appointments));
}

export async function getAppointmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const appointment = await appointmentService.getById(
    requireTenant(request).clinicId,
    validatedParams<AppointmentIdParam>(request).appointmentId,
  );
  return reply.send(ok(appointment));
}

export async function getAppointmentActivityHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit } = validatedQuery<AppointmentActivityQuery>(request);
  const { result, pagination } = await appointmentService.getActivity(
    requireTenant(request).clinicId,
    validatedParams<AppointmentIdParam>(request).appointmentId,
    { page, limit },
  );
  return reply.send(paginated(result, pagination));
}

export async function createAppointmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = validatedBody<CreateAppointmentBody>(request);

  const appointment = await appointmentService.create(
    requireTenant(request).clinicId,
    {
      patientId: body.patientId,
      appointmentTypeId: body.appointmentTypeId,
      startAt: new Date(body.startAt),
      ...(body.durationMinutes === undefined ? {} : { durationMinutes: body.durationMinutes }),
      note: body.note ?? null,
      ...(body.allowOverbooking === undefined
        ? {}
        : { allowOverbooking: body.allowOverbooking }),
    },
    mutationContext(request),
  );

  return reply.status(201).send(ok(appointment));
}

export async function updateAppointmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = validatedBody<UpdateAppointmentBody>(request);

  const appointment = await appointmentService.update(
    requireTenant(request).clinicId,
    validatedParams<AppointmentIdParam>(request).appointmentId,
    {
      ...(body.patientId === undefined ? {} : { patientId: body.patientId }),
      ...(body.appointmentTypeId === undefined
        ? {}
        : { appointmentTypeId: body.appointmentTypeId }),
      ...(body.startAt === undefined ? {} : { startAt: new Date(body.startAt) }),
      ...(body.durationMinutes === undefined ? {} : { durationMinutes: body.durationMinutes }),
      ...(body.note === undefined ? {} : { note: body.note }),
      ...(body.allowOverbooking === undefined
        ? {}
        : { allowOverbooking: body.allowOverbooking }),
    },
    mutationContext(request),
  );

  return reply.send(ok(appointment));
}

export async function changeAppointmentStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const tenant = requireTenant(request);

  const appointment = await appointmentService.changeStatus(
    tenant.clinicId,
    validatedParams<AppointmentIdParam>(request).appointmentId,
    validatedBody<ChangeStatusBody>(request).status,
    {
      ...mutationContext(request),
      // Decided here, from the verified membership: the endpoint takes every
      // transition through one body field, so the route guard cannot tell a
      // check-in from a clinical start.
      canStartVisit: hasPermission(tenant, PERMISSIONS.APPOINTMENT_START_VISIT),
      canCompleteVisit: hasPermission(tenant, PERMISSIONS.APPOINTMENT_COMPLETE_VISIT),
    },
  );
  return reply.send(ok(appointment));
}

export async function cancelAppointmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const appointment = await appointmentService.cancel(
    requireTenant(request).clinicId,
    validatedParams<AppointmentIdParam>(request).appointmentId,
    validatedBody<CancelAppointmentBody>(request)?.reason ?? null,
    mutationContext(request),
  );
  return reply.send(ok(appointment));
}

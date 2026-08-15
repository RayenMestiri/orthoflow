import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, paginatedSchema, successSchema } from '../../common/validation/api-schemas.js';
import {
  completeClinicalVisitHandler,
  ensureAppointmentVisitHandler,
  getAppointmentVisitHandler,
  getClinicalVisitHandler,
  listPatientClinicalVisitsHandler,
  updateClinicalVisitHandler,
} from './clinical-visit.controller.js';
import {
  appointmentVisitParamSchema,
  clinicalVisitDtoSchema,
  clinicalVisitSummaryDtoSchema,
  clinicalVisitWriteBodySchema,
  completeClinicalVisitBodySchema,
  patientVisitParamSchema,
  patientVisitsQuerySchema,
  visitIdParamSchema,
} from './clinical-visit.schema.js';

export const appointmentClinicalVisitRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  app.get('/:appointmentId/clinical-visit', {
    preHandler: [app.requirePermission(PERMISSIONS.CLINICAL_VISIT_READ)],
    schema: { tags: ['clinical-visits'], params: appointmentVisitParamSchema,
      response: { 200: successSchema(clinicalVisitDtoSchema), ...errorResponses(400, 401, 403, 404) } },
  }, getAppointmentVisitHandler);
  app.post('/:appointmentId/clinical-visit', {
    preHandler: [app.requirePermission(PERMISSIONS.CLINICAL_VISIT_MANAGE)],
    schema: { tags: ['clinical-visits'], params: appointmentVisitParamSchema,
      response: { 200: successSchema(clinicalVisitDtoSchema), ...errorResponses(400, 401, 403, 404, 409, 422) } },
  }, ensureAppointmentVisitHandler);
};

export const patientClinicalVisitRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  app.get('/:patientId/clinical-visits', {
    preHandler: [app.requirePermission(PERMISSIONS.CLINICAL_VISIT_READ)],
    schema: { tags: ['clinical-visits'], params: patientVisitParamSchema, querystring: patientVisitsQuerySchema,
      response: { 200: paginatedSchema(clinicalVisitSummaryDtoSchema), ...errorResponses(400, 401, 403, 404) } },
  }, listPatientClinicalVisitsHandler);
};

export const clinicalVisitRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());
  app.get('/:visitId', {
    preHandler: [app.requirePermission(PERMISSIONS.CLINICAL_VISIT_READ)],
    schema: { tags: ['clinical-visits'], params: visitIdParamSchema,
      response: { 200: successSchema(clinicalVisitDtoSchema), ...errorResponses(400, 401, 403, 404) } },
  }, getClinicalVisitHandler);
  app.patch('/:visitId', {
    preHandler: [app.requirePermission(PERMISSIONS.CLINICAL_VISIT_MANAGE)],
    schema: { tags: ['clinical-visits'], params: visitIdParamSchema, body: clinicalVisitWriteBodySchema,
      response: { 200: successSchema(clinicalVisitDtoSchema), ...errorResponses(400, 401, 403, 404, 409, 422) } },
  }, updateClinicalVisitHandler);
  app.post('/:visitId/complete', {
    preHandler: [app.requirePermission(PERMISSIONS.CLINICAL_VISIT_MANAGE)],
    schema: { tags: ['clinical-visits'], params: visitIdParamSchema, body: completeClinicalVisitBodySchema,
      response: { 200: successSchema(clinicalVisitDtoSchema), ...errorResponses(400, 401, 403, 404, 409, 422) } },
  }, completeClinicalVisitHandler);
};

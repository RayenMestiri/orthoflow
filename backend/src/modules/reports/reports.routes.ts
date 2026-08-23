import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, successSchema } from '../../common/validation/api-schemas.js';
import {
  getAppointmentReportsHandler,
  getCareContinuityReportsHandler,
  getFinanceReportsHandler,
  getReportOverviewHandler,
  getTreatmentRetentionReportsHandler,
} from './reports.controller.js';
import {
  appointmentReportsSchema,
  careContinuityReportsSchema,
  financeReportsSchema,
  reportOverviewSchema,
  reportQuerySchema,
  treatmentRetentionReportsSchema,
} from './reports.schema.js';

export const reportsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get('/overview', {
    preHandler: [
      app.requirePermission(PERMISSIONS.REPORT_READ),
      app.requirePermission(PERMISSIONS.CLINICAL_VISIT_READ),
      app.requirePermission(PERMISSIONS.PATIENT_READ),
    ],
    schema: {
      tags: ['reports'],
      summary: 'Period clinical activity and patient creation metrics',
      querystring: reportQuerySchema,
      response: { 200: successSchema(reportOverviewSchema), ...errorResponses(400, 401, 403) },
    },
    handler: getReportOverviewHandler,
  });

  app.get('/appointments', {
    preHandler: [
      app.requirePermission(PERMISSIONS.REPORT_READ),
      app.requirePermission(PERMISSIONS.APPOINTMENT_READ),
    ],
    schema: {
      tags: ['reports'],
      summary: 'Appointment outcomes, attendance and no-show trends',
      querystring: reportQuerySchema,
      response: { 200: successSchema(appointmentReportsSchema), ...errorResponses(400, 401, 403) },
    },
    handler: getAppointmentReportsHandler,
  });

  app.get('/treatments-retention', {
    preHandler: [
      app.requirePermission(PERMISSIONS.REPORT_READ),
      app.requirePermission(PERMISSIONS.TREATMENT_READ),
      app.requirePermission(PERMISSIONS.RETENTION_READ),
    ],
    schema: {
      tags: ['reports'],
      summary: 'Treatment and retention period flows with current snapshots',
      querystring: reportQuerySchema,
      response: {
        200: successSchema(treatmentRetentionReportsSchema),
        ...errorResponses(400, 401, 403),
      },
    },
    handler: getTreatmentRetentionReportsHandler,
  });

  app.get('/finance', {
    preHandler: [
      app.requirePermission(PERMISSIONS.REPORT_READ),
      app.requirePermission(PERMISSIONS.CASH_RECORD_READ),
    ],
    schema: {
      tags: ['reports'],
      summary: 'Valid cash flow and current collection position',
      querystring: reportQuerySchema,
      response: { 200: successSchema(financeReportsSchema), ...errorResponses(400, 401, 403) },
    },
    handler: getFinanceReportsHandler,
  });

  app.get('/care-continuity', {
    preHandler: [
      app.requirePermission(PERMISSIONS.REPORT_READ),
      app.requirePermission(PERMISSIONS.FOLLOW_UP_READ),
      app.requirePermission(PERMISSIONS.TREATMENT_READ),
      app.requirePermission(PERMISSIONS.RETENTION_READ),
    ],
    schema: {
      tags: ['reports'],
      summary: 'Current care-continuity snapshot; never a historical trend',
      response: {
        200: successSchema(careContinuityReportsSchema),
        ...errorResponses(401, 403),
      },
    },
    handler: getCareContinuityReportsHandler,
  });
};

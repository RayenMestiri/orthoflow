import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { errorResponses, successSchema } from '../../common/validation/api-schemas.js';
import {
  getClinicSettingsHandler,
  updateGeneralSettingsHandler,
  updateCareContinuitySettingsHandler,
  updateSchedulingSettingsHandler,
  updateWorkingHoursHandler,
} from './clinic-settings.controller.js';
import {
  clinicSettingsDtoSchema,
  updateGeneralSettingsBodySchema,
  updateCareContinuitySettingsBodySchema,
  updateSchedulingSettingsBodySchema,
  updateWorkingHoursBodySchema,
} from './clinic-settings.schema.js';

/**
 * Mounted at `/api/v1/clinic/settings` (singular — this is *the* clinic the
 * caller is working in, resolved from their membership, not an addressable
 * collection).
 *
 * Reads need `clinic:read`, which every clinic role has, so the front desk can
 * see the opening hours. Writes need `clinic:update`, which only the clinic
 * owner holds — operational policy is the owner-doctor's decision.
 */
export const clinicSettingsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireClinic());

  app.get(
    '/',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CLINIC_READ)],
      schema: {
        tags: ['clinic-settings'],
        summary: 'Read the clinic operating configuration',
        description:
          'Returns the effective configuration. Clinics created before a setting existed fall ' +
          'back to its documented default rather than returning null.',
        security: [{ bearerAuth: [] }],
        response: {
          200: successSchema(clinicSettingsDtoSchema),
          ...errorResponses(401, 403, 404),
        },
      },
    },
    getClinicSettingsHandler,
  );

  app.patch(
    '/general',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CLINIC_UPDATE)],
      schema: {
        tags: ['clinic-settings'],
        summary: 'Update clinic identity and presentation',
        description:
          'Clinic name, contact details, address, timezone, logo and default language. The ' +
          'timezone written here is the clinic-wide authoritative value.',
        security: [{ bearerAuth: [] }],
        body: updateGeneralSettingsBodySchema,
        response: {
          200: successSchema(clinicSettingsDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    updateGeneralSettingsHandler,
  );

  app.patch(
    '/working-hours',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CLINIC_UPDATE)],
      schema: {
        tags: ['clinic-settings'],
        summary: 'Replace the weekly opening pattern',
        description:
          'Each weekday is a list of opening periods, so split shifts (a lunch closure) are ' +
          'expressible. An empty list means closed. Periods must not overlap within a day.',
        security: [{ bearerAuth: [] }],
        body: updateWorkingHoursBodySchema,
        response: {
          200: successSchema(clinicSettingsDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    updateWorkingHoursHandler,
  );

  app.patch(
    '/scheduling',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CLINIC_UPDATE)],
      schema: {
        tags: ['clinic-settings'],
        summary: 'Update scheduling policy',
        description:
          'Grid precision, default appointment length, recommended concurrent capacity and ' +
          'whether the owner may deliberately overbook. Policy only — this endpoint stores the ' +
          'values; the Schedule module enforces them.',
        security: [{ bearerAuth: [] }],
        body: updateSchedulingSettingsBodySchema,
        response: {
          200: successSchema(clinicSettingsDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    updateSchedulingSettingsHandler,
  );

  app.put(
    '/care-continuity',
    {
      preHandler: [app.requirePermission(PERMISSIONS.CLINIC_UPDATE)],
      schema: {
        tags: ['clinic-settings'],
        summary: 'Update operational care-continuity thresholds',
        description: 'These alert thresholds are operational settings, not clinical guidance.',
        security: [{ bearerAuth: [] }],
        body: updateCareContinuitySettingsBodySchema,
        response: {
          200: successSchema(clinicSettingsDtoSchema),
          ...errorResponses(400, 401, 403, 404),
        },
      },
    },
    updateCareContinuitySettingsHandler,
  );
};

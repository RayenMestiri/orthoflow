import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { API_PREFIX } from '../common/constants/api.js';
import { auditLogRoutes } from './audit-logs/audit-log.routes.js';
import { authRoutes } from './auth/auth.routes.js';
import { clinicRoutes } from './clinics/clinic.routes.js';
import { healthRoutes } from './health/health.routes.js';
import { membershipRoutes } from './memberships/membership.routes.js';
import { patientRoutes } from './patients/patient.routes.js';
import { guardianRoutes } from './guardians/guardian.routes.js';

/**
 * The API surface, in one place.
 *
 * Adding a domain later (appointments, treatments, cash records) means writing
 * its module and adding one line here — no change to the app, the plugins or
 * any existing module.
 */
export const registerModules: FastifyPluginAsyncZod = async (app) => {
  // Health lives outside the versioned prefix: probes should not have to track
  // API versions.
  await app.register(healthRoutes);

  await app.register(authRoutes, { prefix: `${API_PREFIX}/auth` });
  await app.register(clinicRoutes, { prefix: `${API_PREFIX}/clinics` });
  await app.register(membershipRoutes, { prefix: `${API_PREFIX}/clinics/:clinicId/members` });
  await app.register(patientRoutes, { prefix: `${API_PREFIX}/patients` });
  await app.register(guardianRoutes, { prefix: `${API_PREFIX}/patients` });
  await app.register(auditLogRoutes, { prefix: `${API_PREFIX}/audit-logs` });
};

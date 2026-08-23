import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { API_PREFIX } from '../common/constants/api.js';
import { auditLogRoutes } from './audit-logs/audit-log.routes.js';
import { authRoutes } from './auth/auth.routes.js';
import { clinicRoutes } from './clinics/clinic.routes.js';
import { clinicSettingsRoutes } from './clinics/clinic-settings.routes.js';
import { healthRoutes } from './health/health.routes.js';
import { membershipRoutes } from './memberships/membership.routes.js';
import { patientRoutes } from './patients/patient.routes.js';
import { guardianRoutes, standaloneGuardianRoutes } from './guardians/guardian.routes.js';
import { appointmentRoutes } from './appointments/appointment.routes.js';
import { appointmentTypeRoutes } from './appointment-types/appointment-type.routes.js';
import { patientTreatmentRoutes, treatmentRoutes } from './treatments/treatment.routes.js';
import {
  cashRecordRoutes,
  patientCashRecordRoutes,
  treatmentFinancialRoutes,
} from './cash-records/cash-record.routes.js';
import { cashRecordReceiptRoutes, receiptRoutes } from './receipts/receipt.routes.js';
import { financeRoutes } from './finance/finance.routes.js';
import { receptionRoutes } from './reception/reception.routes.js';
import {
  patientMediaPatientRoutes,
  patientMediaRoutes,
} from './patient-media/patient-media.routes.js';
import {
  appointmentClinicalVisitRoutes,
  clinicalVisitRoutes,
  patientClinicalVisitRoutes,
} from './clinical-visits/clinical-visit.routes.js';
import { followUpRoutes } from './follow-ups/follow-up.routes.js';
import { globalSearchRoutes } from './global-search/global-search.routes.js';
import { dashboardRoutes } from './dashboard/dashboard.routes.js';
import { taskRoutes } from './tasks/task.routes.js';
import {
  patientRetentionRoutes,
  retentionRoutes,
  treatmentRetentionRoutes,
} from './retention/retention.routes.js';
import {
  consentRoutes,
  consentTemplateRoutes,
  patientConsentRoutes,
} from './consents/consent.routes.js';

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
  await app.register(clinicSettingsRoutes, { prefix: `${API_PREFIX}/clinic/settings` });
  await app.register(membershipRoutes, { prefix: `${API_PREFIX}/clinics/:clinicId/members` });
  await app.register(patientRoutes, { prefix: `${API_PREFIX}/patients` });
  await app.register(guardianRoutes, { prefix: `${API_PREFIX}/patients` });
  await app.register(standaloneGuardianRoutes, { prefix: `${API_PREFIX}/guardians` });
  await app.register(patientTreatmentRoutes, { prefix: `${API_PREFIX}/patients` });
  await app.register(patientRetentionRoutes, { prefix: `${API_PREFIX}/patients` });
  await app.register(patientClinicalVisitRoutes, { prefix: `${API_PREFIX}/patients` });
  await app.register(patientMediaPatientRoutes, { prefix: `${API_PREFIX}/patients` });
  await app.register(patientConsentRoutes, { prefix: `${API_PREFIX}/patients` });
  await app.register(patientMediaRoutes, { prefix: `${API_PREFIX}/patient-media` });
  await app.register(treatmentRoutes, { prefix: `${API_PREFIX}/treatments` });
  await app.register(treatmentRetentionRoutes, { prefix: `${API_PREFIX}/treatments` });
  await app.register(retentionRoutes, { prefix: `${API_PREFIX}/retention-plans` });
  await app.register(patientCashRecordRoutes, { prefix: `${API_PREFIX}/patients` });
  await app.register(cashRecordRoutes, { prefix: `${API_PREFIX}/cash-records` });
  await app.register(cashRecordReceiptRoutes, { prefix: `${API_PREFIX}/cash-records` });
  await app.register(receiptRoutes, { prefix: `${API_PREFIX}/receipts` });
  await app.register(financeRoutes, { prefix: `${API_PREFIX}/finance` });
  await app.register(receptionRoutes, { prefix: `${API_PREFIX}/reception` });
  await app.register(treatmentFinancialRoutes, { prefix: `${API_PREFIX}/treatments` });
  await app.register(appointmentRoutes, { prefix: `${API_PREFIX}/appointments` });
  await app.register(appointmentClinicalVisitRoutes, { prefix: `${API_PREFIX}/appointments` });
  await app.register(clinicalVisitRoutes, { prefix: `${API_PREFIX}/clinical-visits` });
  await app.register(followUpRoutes, { prefix: `${API_PREFIX}/follow-ups` });
  await app.register(appointmentTypeRoutes, { prefix: `${API_PREFIX}/appointment-types` });
  await app.register(auditLogRoutes, { prefix: `${API_PREFIX}/audit-logs` });
  await app.register(globalSearchRoutes, { prefix: `${API_PREFIX}/search` });
  await app.register(dashboardRoutes, { prefix: `${API_PREFIX}/dashboard` });
  await app.register(taskRoutes, { prefix: `${API_PREFIX}/tasks` });
  await app.register(consentTemplateRoutes, { prefix: `${API_PREFIX}/consent-templates` });
  await app.register(consentRoutes, { prefix: `${API_PREFIX}/consents` });
};

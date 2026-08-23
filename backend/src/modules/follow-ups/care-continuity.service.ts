import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { buildPaginationMeta, toPaginationParams } from '../../common/utils/pagination.js';
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import { DEFAULT_CLINIC_SETTINGS } from '../clinics/clinic-settings.types.js';
import {
  careContinuityRepository,
  type CareContinuityRepository,
} from './care-continuity.repository.js';
import type { CareContinuityQuery, CareContinuityRow } from './care-continuity.types.js';

function treatmentLabel(type: string, custom: string | null): string {
  if (custom) return custom;
  const words = type.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export class CareContinuityService {
  constructor(
    private readonly continuity: CareContinuityRepository = careContinuityRepository,
    private readonly clinics: ClinicRepository = clinicRepository,
  ) {}

  async list(
    clinicId: string,
    query: CareContinuityQuery,
    page: { page?: number; limit?: number },
    now: Date = new Date(),
  ) {
    const clinic = await this.clinics.findById(clinicId);
    if (!clinic) {
      throw new NotFoundError('Clinic not found', { code: ERROR_CODES.CLINIC_NOT_FOUND });
    }
    const pagination = toPaginationParams(page);
    const thresholds = clinic.settings?.careContinuity ?? DEFAULT_CLINIC_SETTINGS.careContinuity;
    const result = await this.continuity.list(
      clinicId,
      clinic.timezone,
      now,
      thresholds,
      query,
      pagination,
    );
    const rows: CareContinuityRow[] = result.rows.map((row) => ({
      patient: {
        id: row.patientId.toString(),
        fullName: `${row.patientFirstName} ${row.patientLastName}`.trim(),
        phone: row.patientPhone,
      },
      context: {
        type: row.careType,
        treatment: {
          id: row.treatmentId.toString(),
          label: treatmentLabel(row.treatmentType, row.treatmentCustomLabel),
        },
        retentionPlanId: row.retentionPlanId?.toString() ?? null,
      },
      state: row.state,
      reasons: row.reasons,
      lastClinicalAt: row.lastClinicalAt.toISOString(),
      daysWithoutVisit: row.daysWithoutVisit,
      recommendedAt: row.recommendedAt?.toISOString() ?? null,
      missedAppointment:
        row.missedAppointmentId && row.missedAppointmentAt && row.missedAppointmentStatus
          ? {
              id: row.missedAppointmentId.toString(),
              startAt: row.missedAppointmentAt.toISOString(),
              status: row.missedAppointmentStatus,
            }
          : null,
    }));
    return {
      summary: result.summary[0] ?? { needsAttention: 0, lostToFollowUp: 0 },
      rows,
      pagination: buildPaginationMeta(pagination, result.total[0]?.count ?? 0),
    };
  }

  /** Aggregate-only reporting view; the repository facets avoid loading patient rows. */
  async summarize(clinicId: string, now: Date = new Date()) {
    const clinic = await this.clinics.findById(clinicId);
    if (!clinic) {
      throw new NotFoundError('Clinic not found', { code: ERROR_CODES.CLINIC_NOT_FOUND });
    }
    const thresholds = clinic.settings?.careContinuity ?? DEFAULT_CLINIC_SETTINGS.careContinuity;
    const result = await this.continuity.list(
      clinicId,
      clinic.timezone,
      now,
      thresholds,
      {},
      { page: 1, limit: 1, skip: 0 },
    );
    return {
      timezone: clinic.timezone,
      summary: result.summary[0] ?? { needsAttention: 0, lostToFollowUp: 0 },
      byCareType: result.byCareType.map((row) => ({
        careType: row._id,
        needsAttention: row.needsAttention,
        lostToFollowUp: row.lostToFollowUp,
      })),
      byReason: result.byReason.map((row) => ({ reason: row._id, count: row.count })),
    };
  }
}

export const careContinuityService = new CareContinuityService();

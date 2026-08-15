import { NotFoundError } from '../../common/errors/app-error.js';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { buildPaginationMeta, toPaginationParams } from '../../common/utils/pagination.js';
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import {
  followUpRepository,
  type FollowUpRepository,
  type FollowUpReadQuery,
} from './follow-up.repository.js';
import type { FollowUpRow } from './follow-up.types.js';
import { deriveFollowUpState } from './follow-up.rules.js';

function treatmentLabel(type: string | null, custom: string | null): string {
  if (custom) return custom;
  const words = (type ?? 'Treatment').toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export class FollowUpService {
  constructor(
    private readonly followUps: FollowUpRepository = followUpRepository,
    private readonly clinics: ClinicRepository = clinicRepository,
  ) {}

  async list(
    clinicId: string,
    query: FollowUpReadQuery,
    page: { page?: number; limit?: number },
    now: Date = new Date(),
  ) {
    const clinic = await this.clinics.findById(clinicId);
    if (!clinic) {
      throw new NotFoundError('Clinic not found', { code: ERROR_CODES.CLINIC_NOT_FOUND });
    }
    const pagination = toPaginationParams(page);
    const result = await this.followUps.list(clinicId, clinic.timezone, now, query, pagination);
    const summary = result.summary[0] ?? { needsScheduling: 0, overdue: 0, scheduled: 0 };
    const total = result.total[0]?.count ?? 0;
    const rows: FollowUpRow[] = result.rows.map((row) => {
      const derived = deriveFollowUpState(
        row.recommendedAt,
        row.appointmentId !== null,
        clinic.timezone,
        now,
      );
      return {
        patient: {
          id: row.patientId.toString(),
          fullName: `${row.patientFirstName} ${row.patientLastName}`.trim(),
          phone: row.patientPhone ?? null,
        },
        treatment: row.treatmentId
          ? {
              id: row.treatmentId.toString(),
              label: treatmentLabel(row.treatmentType, row.treatmentCustomLabel),
              status: row.treatmentStatus ?? 'UNKNOWN',
            }
          : null,
        sourceVisit: {
          id: row.visitId.toString(),
          startedAt: row.visitStartedAt.toISOString(),
          completedAt: row.visitCompletedAt.toISOString(),
        },
        recommendedAt: row.recommendedAt.toISOString(),
        appointment:
          row.appointmentId && row.appointmentStartAt && row.appointmentEndAt
            ? {
                id: row.appointmentId.toString(),
                startAt: row.appointmentStartAt.toISOString(),
                endAt: row.appointmentEndAt.toISOString(),
                status: row.appointmentStatus ?? 'SCHEDULED',
                appointmentType: row.appointmentType ?? null,
              }
            : null,
        state: derived.state,
        daysFromRecommendation: derived.daysFromRecommendation,
      };
    });
    return { summary, rows, pagination: buildPaginationMeta(pagination, total) };
  }
}

export const followUpService = new FollowUpService();

import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import type { MutationContext } from '../../common/utils/request-context.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import {
  clinicSettingsRepository,
  type ClinicSettingsRepository,
} from './clinic-settings.repository.js';
import {
  DEFAULT_CLINIC_SETTINGS,
  WEEKDAYS,
  type ClinicSchedulingSettings,
  type ClinicCareContinuitySettings,
  type ClinicSettingsDto,
  type UpdateGeneralSettingsInput,
  type WeeklyWorkingHours,
} from './clinic-settings.types.js';
import type { ClinicRecord } from './clinic.types.js';

/**
 * Maps a clinic record to the settings view.
 *
 * Every branch falls back to `DEFAULT_CLINIC_SETTINGS`: clinics created before
 * this module existed have no `settings` subdocument, and the settings screen
 * must show the effective configuration rather than a page of blanks.
 */
export function toClinicSettingsDto(record: ClinicRecord): ClinicSettingsDto {
  const stored = record.settings;
  const workingHours = stored?.workingHours;

  return {
    clinicId: record._id.toString(),
    general: {
      clinicName: record.name,
      doctorDisplayName: stored?.general?.doctorDisplayName ?? null,
      phone: record.phone ?? null,
      email: record.email ?? null,
      addressLine1: record.address?.line1 ?? null,
      city: record.address?.city ?? null,
      postalCode: record.address?.postalCode ?? null,
      country: record.address?.country ?? null,
      timezone: record.timezone,
      logoUrl: stored?.general?.logoUrl ?? null,
      defaultLanguage:
        stored?.general?.defaultLanguage ?? DEFAULT_CLINIC_SETTINGS.general.defaultLanguage,
    },
    workingHours: Object.fromEntries(
      WEEKDAYS.map((weekday) => [
        weekday,
        (workingHours?.[weekday] ?? DEFAULT_CLINIC_SETTINGS.workingHours[weekday]).map(
          (period) => ({ start: period.start, end: period.end }),
        ),
      ]),
    ) as WeeklyWorkingHours,
    scheduling: {
      slotIntervalMinutes:
        stored?.scheduling?.slotIntervalMinutes ??
        DEFAULT_CLINIC_SETTINGS.scheduling.slotIntervalMinutes,
      defaultAppointmentDurationMinutes:
        stored?.scheduling?.defaultAppointmentDurationMinutes ??
        DEFAULT_CLINIC_SETTINGS.scheduling.defaultAppointmentDurationMinutes,
      defaultConcurrentCapacity:
        stored?.scheduling?.defaultConcurrentCapacity ??
        DEFAULT_CLINIC_SETTINGS.scheduling.defaultConcurrentCapacity,
      allowOwnerOverbooking:
        stored?.scheduling?.allowOwnerOverbooking ??
        DEFAULT_CLINIC_SETTINGS.scheduling.allowOwnerOverbooking,
    },
    careContinuity: {
      treatmentInactivityDays:
        stored?.careContinuity?.treatmentInactivityDays ??
        DEFAULT_CLINIC_SETTINGS.careContinuity.treatmentInactivityDays,
      retentionInactivityDays:
        stored?.careContinuity?.retentionInactivityDays ??
        DEFAULT_CLINIC_SETTINGS.careContinuity.retentionInactivityDays,
      missedAppointmentRebookGraceDays:
        stored?.careContinuity?.missedAppointmentRebookGraceDays ??
        DEFAULT_CLINIC_SETTINGS.careContinuity.missedAppointmentRebookGraceDays,
    },
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Clinic operating configuration use cases.
 *
 * `clinicId` always comes from the request's verified tenant context — no
 * endpoint here accepts a clinic id from a payload.
 *
 * SCOPE: this service persists policy. It never interprets it. Capacity
 * enforcement, slot snapping and overlap rules belong to the Schedule module,
 * which reads these values.
 */
export class ClinicSettingsService {
  constructor(
    private readonly settings: ClinicSettingsRepository = clinicSettingsRepository,
    private readonly audit: AuditLogService = auditLogService,
  ) {}

  async get(clinicId: string): Promise<ClinicSettingsDto> {
    const clinic = await this.settings.findClinic(clinicId);
    if (!clinic) {
      throw new NotFoundError('Clinic not found', { code: ERROR_CODES.CLINIC_NOT_FOUND });
    }
    return toClinicSettingsDto(clinic);
  }

  async updateGeneral(
    clinicId: string,
    changes: UpdateGeneralSettingsInput,
    context: MutationContext,
  ): Promise<ClinicSettingsDto> {
    const updated = await this.settings.updateGeneral(clinicId, changes);
    const dto = this.requireUpdated(updated);

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.CLINIC_SETTINGS_UPDATED,
      resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
      resourceId: clinicId,
      // Field names only — the trail records what changed, not a copy of it.
      metadata: { section: 'general', fields: Object.keys(changes) },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return dto;
  }

  async updateWorkingHours(
    clinicId: string,
    workingHours: WeeklyWorkingHours,
    context: MutationContext,
  ): Promise<ClinicSettingsDto> {
    const updated = await this.settings.updateWorkingHours(clinicId, workingHours);
    const dto = this.requireUpdated(updated);

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.CLINIC_WORKING_HOURS_UPDATED,
      resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
      resourceId: clinicId,
      metadata: {
        section: 'workingHours',
        // Shape, not content: how many periods each day now has.
        openDays: WEEKDAYS.filter((weekday) => workingHours[weekday].length > 0).length,
        totalPeriods: WEEKDAYS.reduce(
          (total, weekday) => total + workingHours[weekday].length,
          0,
        ),
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return dto;
  }

  async updateScheduling(
    clinicId: string,
    scheduling: ClinicSchedulingSettings,
    context: MutationContext,
  ): Promise<ClinicSettingsDto> {
    const updated = await this.settings.updateScheduling(clinicId, scheduling);
    const dto = this.requireUpdated(updated);

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.CLINIC_SCHEDULING_SETTINGS_UPDATED,
      resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
      resourceId: clinicId,
      metadata: { section: 'scheduling', ...scheduling },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return dto;
  }

  async updateCareContinuity(
    clinicId: string,
    careContinuity: ClinicCareContinuitySettings,
    context: MutationContext,
  ): Promise<ClinicSettingsDto> {
    const dto = this.requireUpdated(
      await this.settings.updateCareContinuity(clinicId, careContinuity),
    );
    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.CLINIC_CARE_CONTINUITY_SETTINGS_UPDATED,
      resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
      resourceId: clinicId,
      metadata: { section: 'careContinuity', ...careContinuity },
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return dto;
  }

  private requireUpdated(updated: ClinicRecord | null): ClinicSettingsDto {
    if (!updated) {
      throw new NotFoundError('Clinic not found', { code: ERROR_CODES.CLINIC_NOT_FOUND });
    }
    return toClinicSettingsDto(updated);
  }
}

export const clinicSettingsService = new ClinicSettingsService();

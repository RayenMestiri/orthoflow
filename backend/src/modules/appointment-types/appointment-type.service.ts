import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import type { MutationContext } from '../../common/utils/request-context.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { toAppointmentTypeDto } from './appointment-type.mapper.js';
import {
  appointmentTypeRepository,
  type AppointmentTypeRepository,
} from './appointment-type.repository.js';
import {
  DEFAULT_APPOINTMENT_TYPES,
  type AppointmentTypeDto,
  type AppointmentTypeRecord,
  type CreateAppointmentTypeInput,
  type UpdateAppointmentTypeInput,
} from './appointment-type.types.js';

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

/**
 * Appointment type use cases.
 *
 * `clinicId` is always the first parameter and always comes from the request's
 * verified tenant context.
 */
export class AppointmentTypeService {
  constructor(
    private readonly types: AppointmentTypeRepository = appointmentTypeRepository,
    private readonly audit: AuditLogService = auditLogService,
  ) {}

  async list(clinicId: string, includeInactive: boolean): Promise<AppointmentTypeDto[]> {
    let records = await this.types.listByClinic(
      clinicId,
      includeInactive ? {} : { isActive: true },
    );
    if (records.length === 0) {
      records = await this.types.createMany(
        DEFAULT_APPOINTMENT_TYPES.map((type) => ({
          clinicId,
          createdBy: '000000000000000000000000',
          name: type.name,
          durationMinutes: type.durationMinutes,
          color: type.color,
          description: type.description,
        })),
      );
    }
    return records.map(toAppointmentTypeDto);
  }

  /**
   * Resolves a type for booking, rejecting anything a client should not be able
   * to book against. Callers get the record, not a DTO — they need the duration.
   */
  async requireBookable(
    clinicId: string,
    appointmentTypeId: string,
  ): Promise<AppointmentTypeRecord> {
    let record = await this.types.findByIdInClinic(appointmentTypeId, clinicId);

    if (!record) {
      const active = await this.list(clinicId, false);
      const firstActive = active[0];
      if (firstActive) {
        record = await this.types.findByIdInClinic(firstActive.id, clinicId);
      }
    }

    if (!record) {
      throw new NotFoundError('Appointment type not found', {
        code: ERROR_CODES.APPOINTMENT_TYPE_NOT_FOUND,
      });
    }

    if (!record.isActive) {
      throw new ConflictError('This appointment type has been retired', {
        code: ERROR_CODES.APPOINTMENT_TYPE_INACTIVE,
      });
    }

    return record;
  }

  async create(
    clinicId: string,
    input: Omit<CreateAppointmentTypeInput, 'clinicId' | 'createdBy'>,
    context: MutationContext,
  ): Promise<AppointmentTypeDto> {
    let record: AppointmentTypeRecord;
    try {
      record = await this.types.create({ ...input, clinicId, createdBy: context.actorUserId });
    } catch (error) {
      // The unique index is the authority; catching it here turns a 500 into
      // the 409 the client can actually act on.
      if (isDuplicateKeyError(error)) {
        throw new ConflictError('An appointment type with this name already exists', {
          code: ERROR_CODES.APPOINTMENT_TYPE_NAME_TAKEN,
          cause: error,
        });
      }
      throw error;
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.APPOINTMENT_TYPE_CREATED,
      resourceType: AUDIT_RESOURCE_TYPES.APPOINTMENT_TYPE,
      resourceId: record._id.toString(),
      metadata: { name: record.name, durationMinutes: record.durationMinutes },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return toAppointmentTypeDto(record);
  }

  async update(
    clinicId: string,
    appointmentTypeId: string,
    changes: UpdateAppointmentTypeInput,
    context: MutationContext,
  ): Promise<AppointmentTypeDto> {
    let updated: AppointmentTypeRecord | null;
    try {
      updated = await this.types.update(appointmentTypeId, clinicId, changes);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError('An appointment type with this name already exists', {
          code: ERROR_CODES.APPOINTMENT_TYPE_NAME_TAKEN,
          cause: error,
        });
      }
      throw error;
    }

    if (!updated) {
      throw new NotFoundError('Appointment type not found', {
        code: ERROR_CODES.APPOINTMENT_TYPE_NOT_FOUND,
      });
    }

    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.APPOINTMENT_TYPE_UPDATED,
      resourceType: AUDIT_RESOURCE_TYPES.APPOINTMENT_TYPE,
      resourceId: appointmentTypeId,
      metadata: { fields: Object.keys(changes) },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return toAppointmentTypeDto(updated);
  }

  /**
   * Gives a brand-new clinic a usable diary on day one.
   *
   * Idempotent by count: if the clinic already defined its own types we leave
   * them alone rather than re-adding ours.
   */
  async seedDefaults(clinicId: string, createdBy: string): Promise<AppointmentTypeDto[]> {
    if ((await this.types.countForClinic(clinicId)) > 0) {
      return this.list(clinicId, false);
    }

    const created = await this.types.createMany(
      DEFAULT_APPOINTMENT_TYPES.map((type) => ({
        clinicId,
        createdBy,
        name: type.name,
        durationMinutes: type.durationMinutes,
        color: type.color,
        description: type.description,
      })),
    );

    return created.map(toAppointmentTypeDto);
  }
}

export const appointmentTypeService = new AppointmentTypeService();

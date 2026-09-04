import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import type { MutationContext } from '../../common/utils/request-context.js';
import { toPaginationParams } from '../../common/utils/pagination.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { appointmentRepository, type AppointmentRepository } from '../appointments/appointment.repository.js';
import { appointmentService, type AppointmentService } from '../appointments/appointment.service.js';
import { APPOINTMENT_STATUSES } from '../appointments/appointment.types.js';
import { patientRepository, type PatientRepository } from '../patients/patient.repository.js';
import { retentionRepository, type RetentionRepository } from '../retention/retention.repository.js';
import { treatmentRepository, type TreatmentRepository } from '../treatments/treatment.repository.js';
import { TREATMENT_STATUSES, TREATMENT_TYPES, type TreatmentRecord } from '../treatments/treatment.types.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import type { ClinicalVisitWriteBody } from './clinical-visit.schema.js';
import { clinicalVisitRepository, type ClinicalVisitRepository } from './clinical-visit.repository.js';
import {
  CLINICAL_REASON_CODES,
  CLINICAL_VISIT_STATUSES,
  type ClinicalVisitDto,
  type ClinicalVisitRecord,
  type ClinicalVisitSummaryDto,
  type ClinicalVisitWriteFields,
} from './clinical-visit.types.js';

export interface ClinicalVisitActorContext extends MutationContext {
  canEditCompleted: boolean;
  canCompleteAppointment: boolean;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function clean(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  return value.trim() || null;
}

export class ClinicalVisitService {
  constructor(
    private readonly visits: ClinicalVisitRepository = clinicalVisitRepository,
    private readonly appointments: AppointmentRepository = appointmentRepository,
    private readonly appointmentLifecycle: AppointmentService = appointmentService,
    private readonly patients: PatientRepository = patientRepository,
    private readonly treatments: TreatmentRepository = treatmentRepository,
    private readonly users: UserRepository = userRepository,
    private readonly audit: AuditLogService = auditLogService,
    private readonly retention: RetentionRepository = retentionRepository,
  ) {}

  async ensureForAppointment(
    clinicId: string,
    appointmentId: string,
    context: MutationContext,
  ): Promise<ClinicalVisitDto> {
    const appointment = await this.requireAppointment(clinicId, appointmentId);
    const existing = await this.visits.findByAppointment(appointmentId, clinicId);
    if (existing) return this.hydrate(clinicId, existing);
    if (
      appointment.status !== APPOINTMENT_STATUSES.IN_TREATMENT &&
      appointment.status !== APPOINTMENT_STATUSES.COMPLETED
    ) {
      throw new BusinessRuleError('A clinical visit can only begin when the appointment is in treatment or completed', {
        code: ERROR_CODES.CLINICAL_VISIT_INVALID_APPOINTMENT_STATE,
      });
    }

    const patientId = appointment.patientId.toString();
    const retentionPlan = appointment.retentionPlanId
      ? await this.retention.findPlanById(clinicId, appointment.retentionPlanId.toString())
      : null;
    if (appointment.retentionPlanId && (!retentionPlan || retentionPlan.patientId.toString() !== patientId)) {
      throw new BusinessRuleError('The appointment retention context is invalid for this patient', {
        code: ERROR_CODES.CLINICAL_VISIT_TREATMENT_MISMATCH,
      });
    }
    if (
      retentionPlan &&
      appointment.treatmentId &&
      retentionPlan.treatmentId.toString() !== appointment.treatmentId.toString()
    ) {
      throw new BusinessRuleError('The appointment treatment and retention contexts do not match', {
        code: ERROR_CODES.CLINICAL_VISIT_TREATMENT_MISMATCH,
      });
    }
    const contextualTreatmentId =
      appointment.treatmentId?.toString() ?? retentionPlan?.treatmentId.toString() ?? null;
    const activeTreatment = contextualTreatmentId
      ? await this.treatments.findByIdInClinic(contextualTreatmentId, clinicId)
      : await this.treatments.findActiveForPatient(patientId, clinicId);
    if (activeTreatment && activeTreatment.patientId.toString() !== patientId) {
      throw new BusinessRuleError('The appointment treatment context is invalid for this patient', {
        code: ERROR_CODES.CLINICAL_VISIT_TREATMENT_MISMATCH,
      });
    }
    let created: ClinicalVisitRecord;
    try {
      created = await this.visits.create({
        clinicId,
        patientId,
        appointmentId,
        treatmentId: activeTreatment?._id.toString() ?? null,
        retentionPlanId: retentionPlan?._id.toString() ?? null,
        startedAt: appointment.treatmentStartedAt ?? appointment.startAt ?? new Date(),
        createdBy: context.actorUserId,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const raced = await this.visits.findByAppointment(appointmentId, clinicId);
      if (!raced) throw new ConflictError('The visit was created concurrently; reload and try again');
      return this.hydrate(clinicId, raced);
    }
    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.CLINICAL_VISIT_CREATED,
      resourceType: AUDIT_RESOURCE_TYPES.CLINICAL_VISIT,
      resourceId: created._id.toString(),
      metadata: {
        appointmentId,
        patientId,
        hasTreatment: !!activeTreatment,
        retentionPlanId: retentionPlan?._id.toString() ?? null,
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return this.hydrate(clinicId, created);
  }

  async getByAppointment(clinicId: string, appointmentId: string): Promise<ClinicalVisitDto> {
    await this.requireAppointment(clinicId, appointmentId);
    const visit = await this.visits.findByAppointment(appointmentId, clinicId);
    if (!visit) throw this.notFound();
    return this.hydrate(clinicId, visit);
  }

  async getById(clinicId: string, visitId: string): Promise<ClinicalVisitDto> {
    return this.hydrate(clinicId, await this.requireVisit(clinicId, visitId));
  }

  async listForPatient(
    clinicId: string,
    patientId: string,
    page: { page?: number; limit?: number },
  ) {
    if (!(await this.patients.findByIdInClinic(patientId, clinicId))) {
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }
    const pagination = toPaginationParams(page);
    const { items, total } = await this.visits.listByPatient(patientId, clinicId, pagination);
    const userIds = [...new Set(items.map((item) => item.createdBy.toString()))];
    const users = new Map(
      (await this.users.findManyByIds(userIds)).map((user) => [
        user._id.toString(),
        `${user.firstName} ${user.lastName}`.trim(),
      ]),
    );
    return {
      result: {
        items: items.map((item) => this.toSummary(item, users.get(item.createdBy.toString()) ?? 'Clinician')),
        total,
      },
      pagination,
    };
  }

  async update(
    clinicId: string,
    visitId: string,
    body: ClinicalVisitWriteBody,
    context: ClinicalVisitActorContext,
  ): Promise<ClinicalVisitDto> {
    const visit = await this.requireVisit(clinicId, visitId);
    if (visit.status === CLINICAL_VISIT_STATUSES.COMPLETED && !context.canEditCompleted) {
      throw new BusinessRuleError('Only the clinic owner may amend a completed clinical note', {
        code: ERROR_CODES.CLINICAL_VISIT_ALREADY_COMPLETED,
      });
    }
    const fields = await this.normalizeAndValidateAssociations(clinicId, visit, body);
    const updated = await this.visits.update(visitId, clinicId, fields, context.actorUserId);
    if (!updated) throw this.notFound();
    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action: AUDIT_ACTIONS.CLINICAL_VISIT_UPDATED,
      resourceType: AUDIT_RESOURCE_TYPES.CLINICAL_VISIT,
      resourceId: visitId,
      metadata: {
        fields: Object.keys(body),
        amendedCompletedVisit: visit.status === CLINICAL_VISIT_STATUSES.COMPLETED,
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return this.hydrate(clinicId, updated);
  }

  async complete(
    clinicId: string,
    visitId: string,
    body: ClinicalVisitWriteBody,
    context: ClinicalVisitActorContext,
  ): Promise<ClinicalVisitDto> {
    const visit = await this.requireVisit(clinicId, visitId);
    if (visit.status === CLINICAL_VISIT_STATUSES.COMPLETED) {
      throw new ConflictError('This clinical visit is already completed', {
        code: ERROR_CODES.CLINICAL_VISIT_ALREADY_COMPLETED,
      });
    }
    const appointment = await this.requireAppointment(clinicId, visit.appointmentId.toString());
    if (
      appointment.status !== APPOINTMENT_STATUSES.IN_TREATMENT &&
      appointment.status !== APPOINTMENT_STATUSES.COMPLETED
    ) {
      throw new BusinessRuleError('The linked appointment must be in treatment or completed before completion', {
        code: ERROR_CODES.CLINICAL_VISIT_INVALID_APPOINTMENT_STATE,
      });
    }
    const fields = await this.normalizeAndValidateAssociations(clinicId, visit, body);
    this.assertCompleteEnough({
      reasonCode: fields.reasonCode === undefined ? visit.reasonCode : fields.reasonCode,
      reasonOther: fields.reasonOther === undefined ? visit.reasonOther : fields.reasonOther,
      observations: fields.observations === undefined ? visit.observations : fields.observations,
      procedures: fields.procedures ?? visit.procedures,
      procedureDetails:
        fields.procedureDetails === undefined ? visit.procedureDetails : fields.procedureDetails,
      patientInstructions:
        fields.patientInstructions === undefined
          ? visit.patientInstructions
          : fields.patientInstructions,
      doctorNote: fields.doctorNote === undefined ? visit.doctorNote : fields.doctorNote,
      nextStepNote: fields.nextStepNote === undefined ? visit.nextStepNote : fields.nextStepNote,
    });
    const completedAt = new Date();

    const completed = await withTransaction(async (session) => {
      if (Object.keys(fields).length > 0) {
        await this.visits.update(visitId, clinicId, fields, context.actorUserId, session);
      }
      if (appointment.status !== APPOINTMENT_STATUSES.COMPLETED) {
        await this.appointmentLifecycle.changeStatus(
          clinicId,
          appointment._id.toString(),
          APPOINTMENT_STATUSES.COMPLETED,
          {
            ...context,
            canStartVisit: true,
            canCompleteVisit: context.canCompleteAppointment,
          },
          session,
        );
      }
      const record = await this.visits.complete(
        visitId,
        clinicId,
        context.actorUserId,
        completedAt,
        session,
      );
      if (!record) throw new ConflictError('The clinical visit changed; reload and try again');
      await this.audit.record(
        {
          clinicId,
          actorUserId: context.actorUserId,
          action: AUDIT_ACTIONS.CLINICAL_VISIT_COMPLETED,
          resourceType: AUDIT_RESOURCE_TYPES.CLINICAL_VISIT,
          resourceId: visitId,
          metadata: {
            appointmentId: appointment._id.toString(),
            reasonCode: fields.reasonCode ?? visit.reasonCode,
            procedureCount: fields.procedures?.length ?? visit.procedures.length,
          },
          ip: context.ip,
          userAgent: context.userAgent,
        },
        session,
      );
      return record;
    });
    return this.hydrate(clinicId, completed);
  }

  private async normalizeAndValidateAssociations(
    clinicId: string,
    visit: ClinicalVisitRecord,
    body: ClinicalVisitWriteBody,
  ): Promise<ClinicalVisitWriteFields> {
    const fields = {
      ...body,
      ...(body.nextVisitRecommendedAt === undefined
        ? {}
        : {
            nextVisitRecommendedAt:
              body.nextVisitRecommendedAt === null ? null : new Date(body.nextVisitRecommendedAt),
          }),
    } as unknown as ClinicalVisitWriteFields;
    for (const key of [
      'reasonOther',
      'observations',
      'procedureDetails',
      'patientInstructions',
      'doctorNote',
      'nextStepNote',
    ] as const) {
      if (key in fields) fields[key] = clean(fields[key]);
    }
    const reasonCode = fields.reasonCode ?? visit.reasonCode;
    if (reasonCode !== CLINICAL_REASON_CODES.OTHER && fields.reasonOther !== undefined) {
      fields.reasonOther = null;
    }
    let resolvedTreatmentId =
      fields.treatmentId === undefined ? (visit.treatmentId?.toString() ?? null) : fields.treatmentId;
    const resolvedRetentionPlanId =
      fields.retentionPlanId === undefined
        ? (visit.retentionPlanId?.toString() ?? null)
        : fields.retentionPlanId;
    if (resolvedRetentionPlanId) {
      const plan = await this.retention.findPlanById(clinicId, resolvedRetentionPlanId);
      if (!plan || plan.patientId.toString() !== visit.patientId.toString()) {
        throw new BusinessRuleError('The selected retention plan does not belong to this patient', {
          code: ERROR_CODES.CLINICAL_VISIT_TREATMENT_MISMATCH,
        });
      }
      if (!resolvedTreatmentId) {
        resolvedTreatmentId = plan.treatmentId.toString();
        fields.treatmentId = resolvedTreatmentId;
      }
      if (plan.treatmentId.toString() !== resolvedTreatmentId) {
        throw new BusinessRuleError('The selected treatment and retention plan do not match', {
          code: ERROR_CODES.CLINICAL_VISIT_TREATMENT_MISMATCH,
        });
      }
    }
    if (resolvedTreatmentId) {
      const treatment = await this.treatments.findByIdInClinic(resolvedTreatmentId, clinicId);
      if (!treatment || treatment.patientId.toString() !== visit.patientId.toString()) {
        throw new BusinessRuleError('The selected treatment does not belong to this patient', {
          code: ERROR_CODES.CLINICAL_VISIT_TREATMENT_MISMATCH,
        });
      }
      if (treatment.status === TREATMENT_STATUSES.CANCELLED) {
        throw new BusinessRuleError('A cancelled treatment cannot be linked to a new clinical note', {
          code: ERROR_CODES.CLINICAL_VISIT_TREATMENT_MISMATCH,
        });
      }
    }
    return fields;
  }

  private assertCompleteEnough(visit: {
    reasonCode: ClinicalVisitRecord['reasonCode'];
    reasonOther: string | null;
    observations: string | null;
    procedures: ClinicalVisitRecord['procedures'];
    procedureDetails: string | null;
    patientInstructions: string | null;
    doctorNote: string | null;
    nextStepNote: string | null;
  }): void {
    if (!visit.reasonCode) {
      throw new BusinessRuleError('A visit reason is required before completion', {
        code: ERROR_CODES.CLINICAL_VISIT_INCOMPLETE_NOTE,
      });
    }
    if (visit.reasonCode === CLINICAL_REASON_CODES.OTHER && !visit.reasonOther) {
      throw new BusinessRuleError('Describe the visit reason when Other is selected', {
        code: ERROR_CODES.CLINICAL_VISIT_INCOMPLETE_NOTE,
      });
    }
    const meaningful =
      !!visit.observations ||
      visit.procedures.length > 0 ||
      !!visit.procedureDetails ||
      !!visit.patientInstructions ||
      !!visit.doctorNote ||
      !!visit.nextStepNote;
    if (!meaningful) {
      throw new BusinessRuleError('Add at least one clinical finding, procedure, instruction or note', {
        code: ERROR_CODES.CLINICAL_VISIT_INCOMPLETE_NOTE,
      });
    }
  }

  private async hydrate(clinicId: string, visit: ClinicalVisitRecord): Promise<ClinicalVisitDto> {
    const [patient, appointment, treatment, retention, previous] = await Promise.all([
      this.patients.findByIdInClinic(visit.patientId.toString(), clinicId),
      this.appointments.findByIdInClinic(visit.appointmentId.toString(), clinicId),
      visit.treatmentId
        ? this.treatments.findByIdInClinic(visit.treatmentId.toString(), clinicId)
        : Promise.resolve(null),
      visit.retentionPlanId
        ? this.retention.findPlanById(clinicId, visit.retentionPlanId.toString())
        : Promise.resolve(null),
      this.visits.findPreviousCompleted(
        visit.patientId.toString(),
        clinicId,
        visit.startedAt,
        visit._id.toString(),
      ),
    ]);
    if (!patient || !appointment || appointment.patientId.toString() !== visit.patientId.toString()) {
      throw this.notFound();
    }
    let previousSummary: ClinicalVisitSummaryDto | null = null;
    if (previous) {
      const actor = await this.users.findById(previous.createdBy.toString());
      previousSummary = this.toSummary(
        previous,
        actor ? `${actor.firstName} ${actor.lastName}`.trim() : 'Clinician',
      );
    }
    return {
      id: visit._id.toString(),
      clinicId,
      patientId: visit.patientId.toString(),
      appointmentId: visit.appointmentId.toString(),
      treatmentId: visit.treatmentId?.toString() ?? null,
      retentionPlanId: visit.retentionPlanId?.toString() ?? null,
      status: visit.status,
      reasonCode: visit.reasonCode,
      reasonOther: visit.reasonOther,
      observations: visit.observations,
      procedures: visit.procedures,
      procedureDetails: visit.procedureDetails,
      patientInstructions: visit.patientInstructions,
      doctorNote: visit.doctorNote,
      nextVisitRecommendedAt: visit.nextVisitRecommendedAt?.toISOString() ?? null,
      nextStepNote: visit.nextStepNote,
      startedAt: visit.startedAt.toISOString(),
      completedAt: visit.completedAt?.toISOString() ?? null,
      createdBy: visit.createdBy.toString(),
      updatedBy: visit.updatedBy?.toString() ?? null,
      createdAt: visit.createdAt.toISOString(),
      updatedAt: visit.updatedAt.toISOString(),
      context: {
        patient: { id: patient._id.toString(), fullName: `${patient.firstName} ${patient.lastName}`.trim() },
        appointment: {
          id: appointment._id.toString(),
          startAt: appointment.startAt.toISOString(),
          endAt: appointment.endAt.toISOString(),
          status: appointment.status,
        },
        treatment: treatment ? this.toTreatmentSummary(treatment) : null,
        retention: retention
          ? { id: retention._id.toString(), status: retention.status }
          : null,
        previousVisit: previousSummary,
      },
    };
  }

  private toSummary(visit: ClinicalVisitRecord, clinicianName: string): ClinicalVisitSummaryDto {
    return {
      id: visit._id.toString(),
      appointmentId: visit.appointmentId.toString(),
      treatmentId: visit.treatmentId?.toString() ?? null,
      retentionPlanId: visit.retentionPlanId?.toString() ?? null,
      status: visit.status,
      reasonCode: visit.reasonCode,
      reasonOther: visit.reasonOther,
      procedures: visit.procedures,
      patientInstructions: visit.patientInstructions,
      nextVisitRecommendedAt: visit.nextVisitRecommendedAt?.toISOString() ?? null,
      nextStepNote: visit.nextStepNote,
      startedAt: visit.startedAt.toISOString(),
      completedAt: visit.completedAt?.toISOString() ?? null,
      clinicianName,
    };
  }

  private toTreatmentSummary(treatment: TreatmentRecord) {
    const label = treatment.type === TREATMENT_TYPES.OTHER
      ? treatment.customTypeLabel ?? 'Other treatment'
      : treatment.type.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
    return { id: treatment._id.toString(), label, status: treatment.status };
  }

  private async requireVisit(clinicId: string, visitId: string): Promise<ClinicalVisitRecord> {
    const visit = await this.visits.findByIdInClinic(visitId, clinicId);
    if (!visit) throw this.notFound();
    return visit;
  }

  private async requireAppointment(clinicId: string, appointmentId: string) {
    const appointment = await this.appointments.findByIdInClinic(appointmentId, clinicId);
    if (!appointment) {
      throw new NotFoundError('Appointment not found', { code: ERROR_CODES.APPOINTMENT_NOT_FOUND });
    }
    return appointment;
  }

  private notFound(): NotFoundError {
    return new NotFoundError('Clinical visit not found', {
      code: ERROR_CODES.CLINICAL_VISIT_NOT_FOUND,
    });
  }
}

export const clinicalVisitService = new ClinicalVisitService();

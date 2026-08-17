import { hasPermission } from '../../common/authorization/policy.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { TenantContext } from '../../common/types/auth.types.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toPaginationParams } from '../../common/utils/pagination.js';
import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditLogRecord,
} from '../audit-logs/audit-log.types.js';
import type { AppointmentRecord } from '../appointments/appointment.types.js';
import type { ClinicalVisitRecord } from '../clinical-visits/clinical-visit.types.js';
import type { TreatmentRecord } from '../treatments/treatment.types.js';
import { patientRepository, type PatientRepository } from './patient.repository.js';
import {
  patientActivityRepository,
  type PatientActivityContext,
  type PatientActivityRepository,
} from './patient-activity.repository.js';
import {
  PATIENT_ACTIVITY_TARGETS,
  PATIENT_ACTIVITY_TYPES,
  type PatientActivityDto,
  type PatientActivityFilter,
  type PatientActivityVisibility,
} from './patient-activity.types.js';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { NotFoundError } from '../../common/errors/app-error.js';

const APPOINTMENT_STATUS_ACTIVITY = {
  ARRIVED: { type: PATIENT_ACTIVITY_TYPES.PATIENT_ARRIVED, title: 'Patient arrived' },
  WAITING: { type: PATIENT_ACTIVITY_TYPES.PATIENT_WAITING, title: 'Moved to waiting' },
  IN_TREATMENT: { type: PATIENT_ACTIVITY_TYPES.VISIT_STARTED, title: 'Visit started' },
  COMPLETED: {
    type: PATIENT_ACTIVITY_TYPES.APPOINTMENT_COMPLETED,
    title: 'Appointment completed',
  },
} as const;

const TREATMENT_ACTIVITY = {
  [AUDIT_ACTIONS.TREATMENT_CREATED]: {
    type: PATIENT_ACTIVITY_TYPES.TREATMENT_CREATED,
    title: 'Treatment created',
  },
  [AUDIT_ACTIONS.TREATMENT_STARTED]: {
    type: PATIENT_ACTIVITY_TYPES.TREATMENT_STARTED,
    title: 'Treatment started',
  },
  [AUDIT_ACTIONS.TREATMENT_PAUSED]: {
    type: PATIENT_ACTIVITY_TYPES.TREATMENT_PAUSED,
    title: 'Treatment paused',
  },
  [AUDIT_ACTIONS.TREATMENT_RESUMED]: {
    type: PATIENT_ACTIVITY_TYPES.TREATMENT_RESUMED,
    title: 'Treatment resumed',
  },
  [AUDIT_ACTIONS.TREATMENT_COMPLETED]: {
    type: PATIENT_ACTIVITY_TYPES.TREATMENT_COMPLETED,
    title: 'Treatment completed',
  },
  [AUDIT_ACTIONS.TREATMENT_CANCELLED]: {
    type: PATIENT_ACTIVITY_TYPES.TREATMENT_CANCELLED,
    title: 'Treatment cancelled',
  },
} as const;

export class PatientActivityService {
  constructor(
    private readonly activity: PatientActivityRepository = patientActivityRepository,
    private readonly patients: PatientRepository = patientRepository,
  ) {}

  async list(
    tenant: TenantContext,
    patientId: string,
    filter: PatientActivityFilter,
    page: { page?: number; limit?: number },
  ): Promise<{ result: PaginatedResult<PatientActivityDto>; pagination: PaginationParams }> {
    if (!(await this.patients.findByIdInClinic(patientId, tenant.clinicId))) {
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }

    const pagination = toPaginationParams(page);
    const candidateLimit = pagination.skip + pagination.limit;
    const visibility = this.visibilityFor(tenant);
    const [audits, followUps] = await Promise.all([
      this.activity.listAudits(tenant.clinicId, patientId, filter, visibility, candidateLimit),
      this.activity.listFollowUps(
        tenant.clinicId,
        patientId,
        filter,
        visibility.followUps,
        candidateLimit,
      ),
    ]);
    const context = await this.activity.loadContext(
      tenant.clinicId,
      patientId,
      audits.items,
      followUps.items,
    );
    const items = [
      ...audits.items.map((audit) => this.fromAudit(audit, context, visibility)),
      ...followUps.items.map((visit) => this.fromFollowUp(visit, context, visibility)),
    ].sort(
      (left, right) =>
        Date.parse(right.occurredAt) - Date.parse(left.occurredAt) ||
        right.id.localeCompare(left.id),
    );

    return {
      result: {
        items: items.slice(pagination.skip, pagination.skip + pagination.limit),
        total: audits.total + followUps.total,
      },
      pagination,
    };
  }

  private visibilityFor(tenant: TenantContext): PatientActivityVisibility {
    const clinicalDetails = hasPermission(tenant, PERMISSIONS.CLINICAL_VISIT_READ);
    const followUps = hasPermission(tenant, PERMISSIONS.FOLLOW_UP_READ);
    const treatments = hasPermission(tenant, PERMISSIONS.TREATMENT_READ);
    return {
      appointments: hasPermission(tenant, PERMISSIONS.APPOINTMENT_READ),
      clinical: treatments || clinicalDetails || followUps,
      clinicalDetails,
      followUps,
      payments: hasPermission(tenant, PERMISSIONS.CASH_RECORD_READ),
      documents: hasPermission(tenant, PERMISSIONS.PATIENT_MEDIA_READ),
    };
  }

  private fromAudit(
    audit: AuditLogRecord,
    context: PatientActivityContext,
    visibility: PatientActivityVisibility,
  ): PatientActivityDto {
    const resourceId = audit.resourceId?.toString() ?? null;
    const appointment = resourceId ? context.appointments.get(resourceId) : undefined;
    const visit = resourceId ? context.visits.get(resourceId) : undefined;
    const cashRecord = resourceId ? context.cashRecords.get(resourceId) : undefined;
    const media = resourceId ? context.media.get(resourceId) : undefined;
    const directTreatment = resourceId ? context.treatments.get(resourceId) : undefined;
    const treatmentId =
      directTreatment?._id.toString() ??
      appointment?.treatmentId?.toString() ??
      visit?.treatmentId?.toString() ??
      cashRecord?.treatmentId?.toString() ??
      media?.treatmentId?.toString() ??
      null;
    const treatment = treatmentId ? context.treatments.get(treatmentId) : undefined;
    const treatmentSummary = treatment
      ? { id: treatment._id.toString(), label: this.treatmentLabel(treatment) }
      : null;
    const actor = this.actor(audit.actorUserId?.toString() ?? null, context);
    const base = {
      id: audit._id.toString(),
      occurredAt: audit.createdAt.toISOString(),
      subtitle: null,
      detail: null,
      actor,
      treatment: treatmentSummary,
      appointmentId: appointment?._id.toString() ?? null,
      clinicalVisitId: visit?._id.toString() ?? null,
      cashRecordId: cashRecord?._id.toString() ?? null,
      receiptId: cashRecord?.receiptId?.toString() ?? null,
      mediaId: media?._id.toString() ?? null,
      amountMinor: null,
      currency: null,
      receiptNumber: null,
      scheduledAt: null,
      recommendedAt: null,
      cancellationReason: null,
      targetType: null,
      targetId: null,
    } satisfies Omit<PatientActivityDto, 'type' | 'title'>;

    if (audit.action === AUDIT_ACTIONS.APPOINTMENT_STATUS_CHANGED) {
      const transition =
        APPOINTMENT_STATUS_ACTIVITY[
          String(audit.metadata['to']) as keyof typeof APPOINTMENT_STATUS_ACTIVITY
        ];
      return {
        ...base,
        ...transition,
        subtitle: this.appointmentLabel(appointment, context),
        targetType: appointment ? PATIENT_ACTIVITY_TARGETS.APPOINTMENT : null,
        targetId: appointment?._id.toString() ?? null,
      };
    }
    if (audit.action === AUDIT_ACTIONS.APPOINTMENT_CREATED) {
      return {
        ...base,
        type: PATIENT_ACTIVITY_TYPES.APPOINTMENT_SCHEDULED,
        title: 'Appointment scheduled',
        subtitle: this.appointmentLabel(appointment, context),
        scheduledAt: appointment?.startAt.toISOString() ?? this.stringMeta(audit, 'startAt'),
        targetType: appointment ? PATIENT_ACTIVITY_TARGETS.APPOINTMENT : null,
        targetId: appointment?._id.toString() ?? null,
      };
    }
    if (audit.action === AUDIT_ACTIONS.APPOINTMENT_RESCHEDULED) {
      const to = this.objectMeta(audit, 'to');
      return {
        ...base,
        type: PATIENT_ACTIVITY_TYPES.APPOINTMENT_RESCHEDULED,
        title: 'Appointment rescheduled',
        subtitle: this.appointmentLabel(appointment, context),
        scheduledAt:
          typeof to?.['startAt'] === 'string'
            ? to['startAt']
            : (appointment?.startAt.toISOString() ?? null),
        targetType: appointment ? PATIENT_ACTIVITY_TARGETS.APPOINTMENT : null,
        targetId: appointment?._id.toString() ?? null,
      };
    }
    if (audit.action === AUDIT_ACTIONS.APPOINTMENT_CANCELLED) {
      return {
        ...base,
        type: PATIENT_ACTIVITY_TYPES.APPOINTMENT_CANCELLED,
        title: 'Appointment cancelled',
        subtitle: this.appointmentLabel(appointment, context),
        cancellationReason:
          this.stringMeta(audit, 'cancellationReason') ?? appointment?.cancellationReason ?? null,
        targetType: appointment ? PATIENT_ACTIVITY_TARGETS.APPOINTMENT : null,
        targetId: appointment?._id.toString() ?? null,
      };
    }
    if (audit.action === AUDIT_ACTIONS.APPOINTMENT_NO_SHOW) {
      return {
        ...base,
        type: PATIENT_ACTIVITY_TYPES.APPOINTMENT_NO_SHOW,
        title: 'Patient marked no-show',
        subtitle: this.appointmentLabel(appointment, context),
        targetType: appointment ? PATIENT_ACTIVITY_TARGETS.APPOINTMENT : null,
        targetId: appointment?._id.toString() ?? null,
      };
    }

    const treatmentEvent = TREATMENT_ACTIVITY[audit.action as keyof typeof TREATMENT_ACTIVITY];
    if (treatmentEvent) {
      return {
        ...base,
        ...treatmentEvent,
        subtitle: treatmentSummary?.label ?? 'Treatment',
        cancellationReason:
          audit.action === AUDIT_ACTIONS.TREATMENT_CANCELLED
            ? (directTreatment?.cancellationReason ?? null)
            : null,
        targetType: directTreatment ? PATIENT_ACTIVITY_TARGETS.TREATMENT : null,
        targetId: directTreatment?._id.toString() ?? null,
      };
    }

    if (
      audit.action === AUDIT_ACTIONS.CLINICAL_VISIT_COMPLETED ||
      audit.action === AUDIT_ACTIONS.CLINICAL_VISIT_UPDATED
    ) {
      const completed = audit.action === AUDIT_ACTIONS.CLINICAL_VISIT_COMPLETED;
      return {
        ...base,
        type: completed
          ? PATIENT_ACTIVITY_TYPES.CLINICAL_VISIT_COMPLETED
          : PATIENT_ACTIVITY_TYPES.CLINICAL_VISIT_AMENDED,
        title: completed ? 'Clinical visit completed' : 'Completed visit amended',
        subtitle:
          visibility.clinicalDetails && visit?.reasonCode
            ? this.enumLabel(visit.reasonCode)
            : (treatmentSummary?.label ?? null),
        detail:
          visibility.clinicalDetails && visit?.procedures.length
            ? visit.procedures
                .slice(0, 3)
                .map((procedure) => this.enumLabel(procedure))
                .join(' · ')
            : null,
        targetType:
          visibility.clinicalDetails && visit ? PATIENT_ACTIVITY_TARGETS.CLINICAL_VISIT : null,
        targetId: visibility.clinicalDetails ? (visit?._id.toString() ?? null) : null,
      };
    }

    if (
      audit.action === AUDIT_ACTIONS.CASH_RECORD_CREATED ||
      audit.action === AUDIT_ACTIONS.CASH_RECORD_CORRECTED ||
      audit.action === AUDIT_ACTIONS.CASH_RECORD_CANCELLED
    ) {
      const corrected = audit.action === AUDIT_ACTIONS.CASH_RECORD_CORRECTED;
      const cancelled = audit.action === AUDIT_ACTIONS.CASH_RECORD_CANCELLED;
      const receipt = cashRecord ? context.receipts.get(cashRecord._id.toString()) : undefined;
      return {
        ...base,
        type: cancelled
          ? PATIENT_ACTIVITY_TYPES.PAYMENT_CANCELLED
          : corrected
            ? PATIENT_ACTIVITY_TYPES.PAYMENT_CORRECTED
            : PATIENT_ACTIVITY_TYPES.PAYMENT_RECORDED,
        title: cancelled
          ? 'Payment cancelled'
          : corrected
            ? 'Payment corrected'
            : 'Payment recorded',
        subtitle: treatmentSummary?.label ?? null,
        amountMinor: cashRecord?.amountMinor ?? this.numberMeta(audit, 'amountMinor'),
        currency: cashRecord?.currency ?? this.stringMeta(audit, 'currency'),
        receiptNumber: receipt?.receiptNumber ?? null,
        cancellationReason: cancelled
          ? (cashRecord?.cancellationReason ?? this.stringMeta(audit, 'reason'))
          : null,
        targetType: cashRecord ? PATIENT_ACTIVITY_TARGETS.CASH_RECORD : null,
        targetId: cashRecord?._id.toString() ?? null,
      };
    }

    const documentActions: Partial<
      Record<AuditAction, { type: PatientActivityDto['type']; title: string }>
    > = {
      [AUDIT_ACTIONS.PATIENT_MEDIA_UPLOADED]: {
        type: PATIENT_ACTIVITY_TYPES.DOCUMENT_UPLOADED,
        title: media?.mediaType === 'IMAGE' ? 'Photo uploaded' : 'Document uploaded',
      },
      [AUDIT_ACTIONS.PATIENT_MEDIA_ARCHIVED]: {
        type: PATIENT_ACTIVITY_TYPES.DOCUMENT_ARCHIVED,
        title: media?.mediaType === 'IMAGE' ? 'Photo archived' : 'Document archived',
      },
      [AUDIT_ACTIONS.PATIENT_MEDIA_RESTORED]: {
        type: PATIENT_ACTIVITY_TYPES.DOCUMENT_RESTORED,
        title: media?.mediaType === 'IMAGE' ? 'Photo restored' : 'Document restored',
      },
    };
    const documentAction = documentActions[audit.action];
    if (documentAction) {
      return {
        ...base,
        ...documentAction,
        subtitle: media?.title ?? 'Patient file',
        detail: media?.originalFileName ?? null,
        targetType: media ? PATIENT_ACTIVITY_TARGETS.MEDIA : null,
        targetId: media?._id.toString() ?? null,
      };
    }

    throw new Error(`Unsupported patient activity action: ${audit.action}`);
  }

  private fromFollowUp(
    visit: ClinicalVisitRecord,
    context: PatientActivityContext,
    visibility: PatientActivityVisibility,
  ): PatientActivityDto {
    const treatment = visit.treatmentId
      ? context.treatments.get(visit.treatmentId.toString())
      : undefined;
    return {
      id: `follow-up:${visit._id.toString()}`,
      type: PATIENT_ACTIVITY_TYPES.FOLLOW_UP_RECOMMENDED,
      occurredAt: (visit.completedAt ?? visit.updatedAt).toISOString(),
      title: 'Follow-up recommended',
      subtitle: treatment ? this.treatmentLabel(treatment) : null,
      detail: null,
      actor: this.actor((visit.updatedBy ?? visit.createdBy).toString(), context),
      treatment: treatment
        ? { id: treatment._id.toString(), label: this.treatmentLabel(treatment) }
        : null,
      appointmentId: visit.appointmentId.toString(),
      clinicalVisitId: visit._id.toString(),
      cashRecordId: null,
      receiptId: null,
      mediaId: null,
      amountMinor: null,
      currency: null,
      receiptNumber: null,
      scheduledAt: null,
      recommendedAt: visit.nextVisitRecommendedAt?.toISOString() ?? null,
      cancellationReason: null,
      targetType: visibility.clinicalDetails
        ? PATIENT_ACTIVITY_TARGETS.CLINICAL_VISIT
        : null,
      targetId: visibility.clinicalDetails ? visit._id.toString() : null,
    };
  }

  private actor(
    userId: string | null,
    context: PatientActivityContext,
  ): PatientActivityDto['actor'] {
    if (!userId) return { displayName: 'System', role: null };
    const user = context.users.get(userId);
    const membership = context.memberships.get(userId);
    return {
      displayName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Clinic team member',
      role: membership?.role ?? null,
    };
  }

  private appointmentLabel(
    appointment: AppointmentRecord | undefined,
    context: PatientActivityContext,
  ): string | null {
    if (!appointment) return null;
    return (
      context.appointmentTypes.get(appointment.appointmentTypeId.toString())?.name ?? 'Appointment'
    );
  }

  private treatmentLabel(treatment: TreatmentRecord): string {
    return treatment.type === 'OTHER' && treatment.customTypeLabel
      ? treatment.customTypeLabel
      : this.enumLabel(treatment.type);
  }

  private enumLabel(value: string): string {
    const label = value.toLowerCase().replaceAll('_', ' ');
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  private stringMeta(audit: AuditLogRecord, key: string): string | null {
    const value = audit.metadata[key];
    return typeof value === 'string' ? value : null;
  }

  private numberMeta(audit: AuditLogRecord, key: string): number | null {
    const value = audit.metadata[key];
    return typeof value === 'number' ? value : null;
  }

  private objectMeta(audit: AuditLogRecord, key: string): Record<string, unknown> | null {
    const value = audit.metadata[key];
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
}

export const patientActivityService = new PatientActivityService();

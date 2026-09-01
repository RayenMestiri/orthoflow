import { hasPermission } from '../../common/authorization/policy.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { TenantContext } from '../../common/types/auth.types.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toPaginationParams } from '../../common/utils/pagination.js';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { patientRepository, type PatientRepository } from './patient.repository.js';
import {
  patientActivityRepository,
  type PatientActivityContext,
  type PatientActivityRepository,
} from './patient-activity.repository.js';
import {
  PATIENT_ACTIVITY_CATEGORIES,
  PATIENT_ACTIVITY_FILTERS,
  PATIENT_ACTIVITY_TARGETS,
  PATIENT_ACTIVITY_TYPES,
  type PatientActivityDto,
  type PatientActivityFilter,
  type PatientActivityVisibility,
} from './patient-activity.types.js';

const PROCEDURE_LABELS: Record<string, string> = {
  WIRE_CHANGE: "Changement d'arc",
  BRACKET_BONDING: 'Pose de brackets',
  BRACKET_REPAIR: 'Recollage de bracket',
  ELASTICS_INSTRUCTION: 'Consignes élastiques',
  ATTACHMENT_BONDING: "Pose d'attachements",
  IPR: 'Meulage interproximal (IPR)',
  DEBONDING: "Dépose d'appareil",
  RETAINER_DELIVERY: 'Pose de contention',
  RETAINER_CHECK: 'Contrôle de contention',
  ACTIVATION: "Activation d'appareil",
  CLEANING: 'Nettoyage / Prophylaxie',
  IMPRESSION_SCAN: 'Empreinte / Scan 3D',
  OTHER: 'Autre acte',
};

const TREATMENT_TYPE_LABELS: Record<string, string> = {
  METAL_BRACES: 'Bagues métalliques',
  CERAMIC_BRACES: 'Bagues céramiques',
  CLEAR_ALIGNERS: 'Gouttières d’alignement',
  LINGUAL_BRACES: 'Orthodontie linguale',
  EXPANDER: 'Disjoncteur palatin',
  RETAINER: 'Contention orthodontique',
  SURGICAL_ORTHO: 'Orthodontie chirurgicale',
  OTHER: 'Traitement orthodontique',
};

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
    // Overfetch slightly to ensure reliable pagination across combined domains
    const candidateLimit = Math.max(100, (pagination.skip + pagination.limit) * 2);
    const visibility = this.visibilityFor(tenant);

    const records = await this.activity.fetchDomainRecords(
      tenant.clinicId,
      patientId,
      filter,
      visibility,
      candidateLimit,
    );

    const context = await this.activity.loadContext(tenant.clinicId, records);

    const allItems: PatientActivityDto[] = [];

    // 1. Appointments Normalization
    if (
      visibility.appointments &&
      (filter === PATIENT_ACTIVITY_FILTERS.ALL ||
        filter === PATIENT_ACTIVITY_FILTERS.APPOINTMENTS)
    ) {
      for (const appt of records.appointments) {
        const apptId = appt._id.toString();
        const typeName = appt.appointmentTypeId
          ? context.appointmentTypes.get(appt.appointmentTypeId.toString())?.name
          : null;
        const treatment = appt.treatmentId ? context.treatments.get(appt.treatmentId.toString()) : null;
        const treatmentLabel = treatment
          ? treatment.customTypeLabel || TREATMENT_TYPE_LABELS[treatment.type] || 'Traitement'
          : null;
        const actorId = (appt.updatedBy ?? appt.createdBy)?.toString();
        const actor = actorId ? this.formatActor(actorId, context) : null;

        if (appt.status === 'CANCELLED') {
          allItems.push({
            id: `${apptId}_cancelled`,
            category: PATIENT_ACTIVITY_CATEGORIES.APPOINTMENT,
            type: PATIENT_ACTIVITY_TYPES.APPOINTMENT_CANCELLED,
            occurredAt: (appt.cancelledAt ?? appt.updatedAt ?? appt.createdAt).toISOString(),
            title: 'Rendez-vous annulé',
            subtitle: typeName || 'Consultation',
            detail: appt.cancellationReason ? `Motif : ${appt.cancellationReason}` : null,
            actor,
            treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel! } : null,
            appointmentId: apptId,
            clinicalVisitId: null,
            cashRecordId: null,
            receiptId: null,
            mediaId: null,
            amountMinor: null,
            currency: null,
            receiptNumber: null,
            scheduledAt: appt.startAt ? appt.startAt.toISOString() : null,
            recommendedAt: null,
            cancellationReason: appt.cancellationReason ?? null,
            targetType: PATIENT_ACTIVITY_TARGETS.APPOINTMENT,
            targetId: apptId,
          });
        } else if (appt.status === 'NO_SHOW') {
          allItems.push({
            id: `${apptId}_noshow`,
            category: PATIENT_ACTIVITY_CATEGORIES.APPOINTMENT,
            type: PATIENT_ACTIVITY_TYPES.APPOINTMENT_NO_SHOW,
            occurredAt: (appt.noShowAt ?? appt.updatedAt ?? appt.startAt).toISOString(),
            title: 'Rendez-vous non honoré',
            subtitle: typeName || 'Consultation',
            detail: null,
            actor,
            treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel! } : null,
            appointmentId: apptId,
            clinicalVisitId: null,
            cashRecordId: null,
            receiptId: null,
            mediaId: null,
            amountMinor: null,
            currency: null,
            receiptNumber: null,
            scheduledAt: appt.startAt ? appt.startAt.toISOString() : null,
            recommendedAt: null,
            cancellationReason: null,
            targetType: PATIENT_ACTIVITY_TARGETS.APPOINTMENT,
            targetId: apptId,
          });
        } else if (appt.status === 'COMPLETED') {
          allItems.push({
            id: `${apptId}_completed`,
            category: PATIENT_ACTIVITY_CATEGORIES.APPOINTMENT,
            type: PATIENT_ACTIVITY_TYPES.APPOINTMENT_COMPLETED,
            occurredAt: (appt.completedAt ?? appt.updatedAt ?? appt.startAt).toISOString(),
            title: 'Rendez-vous honoré',
            subtitle: typeName || 'Consultation',
            detail: null,
            actor,
            treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel! } : null,
            appointmentId: apptId,
            clinicalVisitId: null,
            cashRecordId: null,
            receiptId: null,
            mediaId: null,
            amountMinor: null,
            currency: null,
            receiptNumber: null,
            scheduledAt: appt.startAt ? appt.startAt.toISOString() : null,
            recommendedAt: null,
            cancellationReason: null,
            targetType: PATIENT_ACTIVITY_TARGETS.APPOINTMENT,
            targetId: apptId,
          });
        } else {
          // Standard scheduled appointment milestone
          allItems.push({
            id: `${apptId}_scheduled`,
            category: PATIENT_ACTIVITY_CATEGORIES.APPOINTMENT,
            type: PATIENT_ACTIVITY_TYPES.APPOINTMENT_SCHEDULED,
            occurredAt: (appt.createdAt ?? appt.startAt).toISOString(),
            title: 'Rendez-vous planifié',
            subtitle: typeName || 'Consultation',
            detail: null,
            actor,
            treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel! } : null,
            appointmentId: apptId,
            clinicalVisitId: null,
            cashRecordId: null,
            receiptId: null,
            mediaId: null,
            amountMinor: null,
            currency: null,
            receiptNumber: null,
            scheduledAt: appt.startAt ? appt.startAt.toISOString() : null,
            recommendedAt: null,
            cancellationReason: null,
            targetType: PATIENT_ACTIVITY_TARGETS.APPOINTMENT,
            targetId: apptId,
          });
        }
      }
    }

    // 2. Clinical Visits & Follow-up Recommendations Normalization
    if (
      visibility.clinical &&
      (filter === PATIENT_ACTIVITY_FILTERS.ALL ||
        filter === PATIENT_ACTIVITY_FILTERS.CLINICAL)
    ) {
      for (const visit of records.visits) {
        const visitId = visit._id.toString();
        const treatment = visit.treatmentId ? context.treatments.get(visit.treatmentId.toString()) : null;
        const treatmentLabel = treatment
          ? treatment.customTypeLabel || TREATMENT_TYPE_LABELS[treatment.type] || 'Traitement'
          : null;
        const actorId = (visit.updatedBy ?? visit.createdBy)?.toString();
        const actor = actorId ? this.formatActor(actorId, context) : null;

        if (visit.status === 'COMPLETED') {
          // Procedures safe summary (redacted if user lacks clinicalDetails permission)
          let proceduresSummary: string | null = null;
          if (visibility.clinicalDetails && Array.isArray(visit.procedures) && visit.procedures.length > 0) {
            proceduresSummary = visit.procedures
              .map((p) => PROCEDURE_LABELS[p] || p)
              .join(' · ');
          }

          allItems.push({
            id: `${visitId}_visit`,
            category: PATIENT_ACTIVITY_CATEGORIES.CLINICAL,
            type: PATIENT_ACTIVITY_TYPES.CLINICAL_VISIT_COMPLETED,
            occurredAt: (visit.completedAt ?? visit.createdAt).toISOString(),
            title: 'Consultation terminée',
            subtitle: treatmentLabel || 'Consultation orthodontique',
            detail: proceduresSummary,
            actor,
            treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel! } : null,
            appointmentId: visit.appointmentId?.toString() ?? null,
            clinicalVisitId: visitId,
            cashRecordId: null,
            receiptId: null,
            mediaId: null,
            amountMinor: null,
            currency: null,
            receiptNumber: null,
            scheduledAt: null,
            recommendedAt: null,
            cancellationReason: null,
            targetType: PATIENT_ACTIVITY_TARGETS.CLINICAL_VISIT,
            targetId: visitId,
          });

          // Follow-up recommendation milestone
          if (visibility.followUps && visit.nextVisitRecommendedAt) {
            allItems.push({
              id: `${visitId}_followup`,
              category: PATIENT_ACTIVITY_CATEGORIES.CLINICAL,
              type: PATIENT_ACTIVITY_TYPES.FOLLOW_UP_RECOMMENDED,
              occurredAt: (visit.completedAt ?? visit.createdAt).toISOString(),
              title: 'Suivi recommandé',
              subtitle: visit.nextStepNote
                ? `Retour conseillé · ${visit.nextStepNote}`
                : 'Retour conseillé pour contrôle',
              detail: null,
              actor,
              treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel! } : null,
              appointmentId: null,
              clinicalVisitId: visitId,
              cashRecordId: null,
              receiptId: null,
              mediaId: null,
              amountMinor: null,
              currency: null,
              receiptNumber: null,
              scheduledAt: null,
              recommendedAt: visit.nextVisitRecommendedAt.toISOString(),
              cancellationReason: null,
              targetType: PATIENT_ACTIVITY_TARGETS.CLINICAL_VISIT,
              targetId: visitId,
            });
          }
        }
      }
    }

    // 3. Treatments Normalization
    if (
      visibility.clinical &&
      (filter === PATIENT_ACTIVITY_FILTERS.ALL ||
        filter === PATIENT_ACTIVITY_FILTERS.CLINICAL)
    ) {
      for (const trt of records.treatments) {
        const trtId = trt._id.toString();
        const treatmentLabel = trt.customTypeLabel || TREATMENT_TYPE_LABELS[trt.type] || 'Traitement';
        const actorId = (trt.updatedBy ?? trt.createdBy)?.toString();
        const actor = actorId ? this.formatActor(actorId, context) : null;

        // Creation event
        if (trt.createdAt) {
          allItems.push({
            id: `${trtId}_created`,
            category: PATIENT_ACTIVITY_CATEGORIES.TREATMENT,
            type: PATIENT_ACTIVITY_TYPES.TREATMENT_CREATED,
            occurredAt: trt.createdAt.toISOString(),
            title: 'Plan de traitement créé',
            subtitle: treatmentLabel,
            detail: null,
            actor,
            treatment: { id: trtId, label: treatmentLabel },
            appointmentId: null,
            clinicalVisitId: null,
            cashRecordId: null,
            receiptId: null,
            mediaId: null,
            amountMinor: null,
            currency: null,
            receiptNumber: null,
            scheduledAt: null,
            recommendedAt: null,
            cancellationReason: null,
            targetType: PATIENT_ACTIVITY_TARGETS.TREATMENT,
            targetId: trtId,
          });
        }

        // Started event
        if (trt.startDate) {
          allItems.push({
            id: `${trtId}_started`,
            category: PATIENT_ACTIVITY_CATEGORIES.TREATMENT,
            type: PATIENT_ACTIVITY_TYPES.TREATMENT_STARTED,
            occurredAt: trt.startDate.toISOString(),
            title: 'Traitement démarré',
            subtitle: treatmentLabel,
            detail: null,
            actor,
            treatment: { id: trtId, label: treatmentLabel },
            appointmentId: null,
            clinicalVisitId: null,
            cashRecordId: null,
            receiptId: null,
            mediaId: null,
            amountMinor: null,
            currency: null,
            receiptNumber: null,
            scheduledAt: null,
            recommendedAt: null,
            cancellationReason: null,
            targetType: PATIENT_ACTIVITY_TARGETS.TREATMENT,
            targetId: trtId,
          });
        }

        // Completed event
        if (trt.completedAt && trt.status === 'COMPLETED') {
          allItems.push({
            id: `${trtId}_completed`,
            category: PATIENT_ACTIVITY_CATEGORIES.TREATMENT,
            type: PATIENT_ACTIVITY_TYPES.TREATMENT_COMPLETED,
            occurredAt: trt.completedAt.toISOString(),
            title: 'Traitement terminé',
            subtitle: treatmentLabel,
            detail: null,
            actor,
            treatment: { id: trtId, label: treatmentLabel },
            appointmentId: null,
            clinicalVisitId: null,
            cashRecordId: null,
            receiptId: null,
            mediaId: null,
            amountMinor: null,
            currency: null,
            receiptNumber: null,
            scheduledAt: null,
            recommendedAt: null,
            cancellationReason: null,
            targetType: PATIENT_ACTIVITY_TARGETS.TREATMENT,
            targetId: trtId,
          });
        }

        // Cancelled event
        if (trt.cancellationReason && trt.status === 'CANCELLED') {
          allItems.push({
            id: `${trtId}_cancelled`,
            category: PATIENT_ACTIVITY_CATEGORIES.TREATMENT,
            type: PATIENT_ACTIVITY_TYPES.TREATMENT_CANCELLED,
            occurredAt: trt.updatedAt.toISOString(),
            title: 'Traitement annulé',
            subtitle: treatmentLabel,
            detail: `Motif : ${trt.cancellationReason}`,
            actor,
            treatment: { id: trtId, label: treatmentLabel },
            appointmentId: null,
            clinicalVisitId: null,
            cashRecordId: null,
            receiptId: null,
            mediaId: null,
            amountMinor: null,
            currency: null,
            receiptNumber: null,
            scheduledAt: null,
            recommendedAt: null,
            cancellationReason: trt.cancellationReason,
            targetType: PATIENT_ACTIVITY_TARGETS.TREATMENT,
            targetId: trtId,
          });
        }
      }
    }

    // 4. Retention plan and retainer lifecycle normalization
    if (
      visibility.clinical &&
      (filter === PATIENT_ACTIVITY_FILTERS.ALL || filter === PATIENT_ACTIVITY_FILTERS.CLINICAL)
    ) {
      for (const plan of records.retentionPlans ?? []) {
        const planId = plan._id.toString();
        const treatment = context.treatments.get(plan.treatmentId.toString());
        const treatmentLabel = treatment
          ? treatment.customTypeLabel || TREATMENT_TYPE_LABELS[treatment.type] || 'Traitement'
          : 'Traitement';
        const actorId = (plan.updatedBy ?? plan.createdBy).toString();
        const actor = this.formatActor(actorId, context);
        const base = {
          category: PATIENT_ACTIVITY_CATEGORIES.TREATMENT,
          actor,
          treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel } : null,
          appointmentId: null,
          clinicalVisitId: null,
          cashRecordId: null,
          receiptId: null,
          mediaId: null,
          amountMinor: null,
          currency: null,
          receiptNumber: null,
          scheduledAt: null,
          cancellationReason: null,
          targetType: PATIENT_ACTIVITY_TARGETS.RETENTION_PLAN,
          targetId: planId,
        } as const;
        allItems.push({
          ...base,
          id: `${planId}_retention_created`,
          type: PATIENT_ACTIVITY_TYPES.RETENTION_CREATED,
          occurredAt: plan.createdAt.toISOString(),
          title: 'Contention planifiée',
          subtitle: treatmentLabel,
          detail: null,
          recommendedAt: plan.initialControlRecommendedAt?.toISOString() ?? null,
        });
        if (plan.startedAt) {
          allItems.push({
            ...base,
            id: `${planId}_retention_started`,
            type: PATIENT_ACTIVITY_TYPES.RETENTION_ACTIVATED,
            occurredAt: plan.startedAt.toISOString(),
            title: 'Contention démarrée',
            subtitle: treatmentLabel,
            detail: null,
            recommendedAt: null,
          });
        }
        if (plan.status === 'COMPLETED' && plan.completedAt) {
          allItems.push({
            ...base,
            id: `${planId}_retention_completed`,
            type: PATIENT_ACTIVITY_TYPES.RETENTION_COMPLETED,
            occurredAt: plan.completedAt.toISOString(),
            title: 'Contention terminée',
            subtitle: treatmentLabel,
            detail: visibility.clinicalDetails ? plan.completionReason : null,
            recommendedAt: null,
          });
        }
        if (plan.status === 'CANCELLED' && plan.cancelledAt) {
          allItems.push({
            ...base,
            id: `${planId}_retention_cancelled`,
            type: PATIENT_ACTIVITY_TYPES.RETENTION_CANCELLED,
            occurredAt: plan.cancelledAt.toISOString(),
            title: 'Contention annulée',
            subtitle: treatmentLabel,
            detail: visibility.clinicalDetails ? plan.cancellationReason : null,
            recommendedAt: null,
            cancellationReason: visibility.clinicalDetails ? plan.cancellationReason : null,
          });
        }
      }

      for (const device of records.retainerDevices ?? []) {
        const deviceId = device._id.toString();
        const treatment = context.treatments.get(device.treatmentId.toString());
        const treatmentLabel = treatment
          ? treatment.customTypeLabel || TREATMENT_TYPE_LABELS[treatment.type] || 'Traitement'
          : 'Traitement';
        const deviceLabel = device.customTypeLabel ?? device.type.toLowerCase().replaceAll('_', ' ');
        const actor = this.formatActor(
          (device.updatedBy ?? device.createdBy).toString(),
          context,
        );
        const base = {
          category: PATIENT_ACTIVITY_CATEGORIES.TREATMENT,
          actor,
          treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel } : null,
          appointmentId: null,
          clinicalVisitId: null,
          cashRecordId: null,
          receiptId: null,
          mediaId: null,
          amountMinor: null,
          currency: null,
          receiptNumber: null,
          scheduledAt: null,
          recommendedAt: null,
          cancellationReason: null,
          targetType: PATIENT_ACTIVITY_TARGETS.RETAINER_DEVICE,
          targetId: deviceId,
        } as const;
        allItems.push({
          ...base,
          id: `${deviceId}_delivered`,
          type: PATIENT_ACTIVITY_TYPES.RETAINER_DELIVERED,
          occurredAt: device.deliveredAt.toISOString(),
          title: 'Appareil de contention remis',
          subtitle: `${deviceLabel} · ${device.arch.toLowerCase()}`,
          detail: null,
        });
        if (device.status !== 'ACTIVE' && device.endedAt) {
          const event =
            device.status === 'REPLACED'
              ? {
                  type: PATIENT_ACTIVITY_TYPES.RETAINER_REPLACED,
                  title: 'Appareil de contention remplacé',
                }
              : device.status === 'LOST'
                ? {
                    type: PATIENT_ACTIVITY_TYPES.RETAINER_LOST,
                    title: 'Appareil de contention perdu',
                  }
                : {
                    type: PATIENT_ACTIVITY_TYPES.RETAINER_DISCONTINUED,
                    title: 'Appareil de contention arrêté',
                  };
          allItems.push({
            ...base,
            id: `${deviceId}_${device.status.toLowerCase()}`,
            type: event.type,
            occurredAt: device.endedAt.toISOString(),
            title: event.title,
            subtitle: deviceLabel,
            detail: null,
          });
        }
      }
    }

    // 5. Cash Records Normalization
    if (
      visibility.payments &&
      (filter === PATIENT_ACTIVITY_FILTERS.ALL ||
        filter === PATIENT_ACTIVITY_FILTERS.PAYMENTS)
    ) {
      for (const cash of records.cashRecords) {
        const cashId = cash._id.toString();
        const receipt = cash.receiptId ? context.receipts.get(cash.receiptId.toString()) : null;
        const treatment = cash.treatmentId ? context.treatments.get(cash.treatmentId.toString()) : null;
        const treatmentLabel = treatment
          ? treatment.customTypeLabel || TREATMENT_TYPE_LABELS[treatment.type] || 'Traitement'
          : null;
        const recordedActorId = (cash.receivedByUserId ?? cash.createdBy)?.toString();
        const recordedActor = recordedActorId ? this.formatActor(recordedActorId, context) : null;
        const payerText = cash.payerLabel ? `Payé par ${cash.payerLabel}` : null;

        if (cash.status === 'RECORDED') {
          allItems.push({
            id: `${cashId}_recorded`,
            category: PATIENT_ACTIVITY_CATEGORIES.PAYMENT,
            type: PATIENT_ACTIVITY_TYPES.PAYMENT_RECORDED,
            occurredAt: (cash.receivedAt ?? cash.createdAt).toISOString(),
            title: 'Paiement enregistré',
            subtitle: [treatmentLabel, receipt?.receiptNumber ? `Reçu ${receipt.receiptNumber}` : null]
              .filter(Boolean)
              .join(' · ') || 'Encaissement',
            detail: payerText,
            actor: recordedActor,
            treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel! } : null,
            appointmentId: null,
            clinicalVisitId: null,
            cashRecordId: cashId,
            receiptId: cash.receiptId?.toString() ?? null,
            mediaId: null,
            amountMinor: cash.amountMinor,
            currency: cash.currency,
            receiptNumber: receipt?.receiptNumber ?? null,
            scheduledAt: null,
            recommendedAt: null,
            cancellationReason: null,
            targetType: PATIENT_ACTIVITY_TARGETS.CASH_RECORD,
            targetId: cashId,
          });
        } else if (cash.status === 'CANCELLED') {
          const cancelledActorId = (cash.cancelledBy ?? cash.createdBy)?.toString();
          const cancelledActor = cancelledActorId
            ? this.formatActor(cancelledActorId, context)
            : recordedActor;

          // Add original payment record
          allItems.push({
            id: `${cashId}_recorded`,
            category: PATIENT_ACTIVITY_CATEGORIES.PAYMENT,
            type: PATIENT_ACTIVITY_TYPES.PAYMENT_RECORDED,
            occurredAt: (cash.receivedAt ?? cash.createdAt).toISOString(),
            title: 'Paiement enregistré',
            subtitle: [treatmentLabel, receipt?.receiptNumber ? `Reçu ${receipt.receiptNumber}` : null]
              .filter(Boolean)
              .join(' · ') || 'Encaissement',
            detail: payerText,
            actor: recordedActor,
            treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel! } : null,
            appointmentId: null,
            clinicalVisitId: null,
            cashRecordId: cashId,
            receiptId: cash.receiptId?.toString() ?? null,
            mediaId: null,
            amountMinor: cash.amountMinor,
            currency: cash.currency,
            receiptNumber: receipt?.receiptNumber ?? null,
            scheduledAt: null,
            recommendedAt: null,
            cancellationReason: null,
            targetType: PATIENT_ACTIVITY_TARGETS.CASH_RECORD,
            targetId: cashId,
          });

          // Add cancellation event
          allItems.push({
            id: `${cashId}_cancelled`,
            category: PATIENT_ACTIVITY_CATEGORIES.PAYMENT,
            type: PATIENT_ACTIVITY_TYPES.PAYMENT_CANCELLED,
            occurredAt: (cash.cancelledAt ?? cash.updatedAt ?? cash.createdAt).toISOString(),
            title: 'Paiement annulé',
            subtitle: treatmentLabel || 'Encaissement annulé',
            detail: cash.cancellationReason ? `Motif : ${cash.cancellationReason}` : null,
            actor: cancelledActor,
            treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel! } : null,
            appointmentId: null,
            clinicalVisitId: null,
            cashRecordId: cashId,
            receiptId: cash.receiptId?.toString() ?? null,
            mediaId: null,
            amountMinor: cash.amountMinor,
            currency: cash.currency,
            receiptNumber: receipt?.receiptNumber ?? null,
            scheduledAt: null,
            recommendedAt: null,
            cancellationReason: cash.cancellationReason ?? null,
            targetType: PATIENT_ACTIVITY_TARGETS.CASH_RECORD,
            targetId: cashId,
          });
        }
      }
    }

    // 6. Patient Media Normalization
    if (
      (visibility.documents || visibility.consents || visibility.generatedDocuments) &&
      (filter === PATIENT_ACTIVITY_FILTERS.ALL ||
        filter === PATIENT_ACTIVITY_FILTERS.DOCUMENTS)
    ) {
      for (const item of visibility.documents ? records.media : []) {
        const mediaId = item._id.toString();
        const treatment = item.treatmentId ? context.treatments.get(item.treatmentId.toString()) : null;
        const treatmentLabel = treatment
          ? treatment.customTypeLabel || TREATMENT_TYPE_LABELS[treatment.type] || 'Traitement'
          : null;
        const actorId = item.uploadedByUserId?.toString();
        const actor = actorId ? this.formatActor(actorId, context) : null;

        const categoryTitle =
          item.category === 'XRAY'
            ? 'Radiographie ajoutée'
            : item.category === 'EXTRAORAL_PHOTO' ||
                item.category === 'INTRAORAL_PHOTO' ||
                item.category === 'PROFILE_PHOTO' ||
                item.category === 'PROGRESS_PHOTO'
              ? 'Photo clinique ajoutée'
              : 'Document ajouté';

        allItems.push({
          id: `${mediaId}_uploaded`,
          category: PATIENT_ACTIVITY_CATEGORIES.DOCUMENT,
          type: PATIENT_ACTIVITY_TYPES.DOCUMENT_UPLOADED,
          occurredAt: (item.uploadedAt ?? item.createdAt).toISOString(),
          title: categoryTitle,
          subtitle: item.originalFileName,
          detail: treatmentLabel,
          actor,
          treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel! } : null,
          appointmentId: null,
          clinicalVisitId: null,
          cashRecordId: null,
          receiptId: null,
          mediaId,
          amountMinor: null,
          currency: null,
          receiptNumber: null,
          scheduledAt: null,
          recommendedAt: null,
          cancellationReason: null,
          targetType: PATIENT_ACTIVITY_TARGETS.MEDIA,
          targetId: mediaId,
        });

        if (item.status === 'ARCHIVED' && item.archivedAt) {
          allItems.push({
            id: `${mediaId}_archived`,
            category: PATIENT_ACTIVITY_CATEGORIES.DOCUMENT,
            type: PATIENT_ACTIVITY_TYPES.DOCUMENT_ARCHIVED,
            occurredAt: item.archivedAt.toISOString(),
            title: 'Document archivé',
            subtitle: item.originalFileName,
            detail: null,
            actor,
            treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel! } : null,
            appointmentId: null,
            clinicalVisitId: null,
            cashRecordId: null,
            receiptId: null,
            mediaId,
            amountMinor: null,
            currency: null,
            receiptNumber: null,
            scheduledAt: null,
            recommendedAt: null,
            cancellationReason: null,
            targetType: PATIENT_ACTIVITY_TARGETS.MEDIA,
            targetId: mediaId,
          });
        }
      }

      for (const consent of visibility.consents ? (records.signedConsents ?? []) : []) {
        const consentId = consent._id.toString();
        const treatment = consent.treatmentId
          ? context.treatments.get(consent.treatmentId.toString())
          : null;
        const treatmentLabel = treatment
          ? treatment.customTypeLabel || TREATMENT_TYPE_LABELS[treatment.type] || 'Traitement'
          : null;
        const baseEvent = {
          category: PATIENT_ACTIVITY_CATEGORIES.DOCUMENT,
          treatment: treatment ? { id: treatment._id.toString(), label: treatmentLabel! } : null,
          appointmentId: null,
          clinicalVisitId: null,
          cashRecordId: null,
          receiptId: null,
          mediaId: null,
          amountMinor: null,
          currency: null,
          receiptNumber: null,
          scheduledAt: null,
          recommendedAt: null,
          targetType: PATIENT_ACTIVITY_TARGETS.CONSENT,
          targetId: consentId,
        };

        allItems.push({
          ...baseEvent,
          id: `${consentId}_signed`,
          type: PATIENT_ACTIVITY_TYPES.CONSENT_SIGNED,
          occurredAt: consent.signedAt.toISOString(),
          title: 'Consentement signé',
          subtitle: consent.titleSnapshot,
          detail: `${consent.consentRef} · ${consent.signerNameSnapshot}`,
          actor: this.formatActor(consent.presentedByUserId.toString(), context),
          cancellationReason: null,
        });

        if (consent.revokedAt) {
          allItems.push({
            ...baseEvent,
            id: `${consentId}_revoked`,
            type: PATIENT_ACTIVITY_TYPES.CONSENT_REVOKED,
            occurredAt: consent.revokedAt.toISOString(),
            title: 'Consentement révoqué',
            subtitle: consent.titleSnapshot,
            detail: consent.revocationReason,
            actor: consent.revokedByUserId
              ? this.formatActor(consent.revokedByUserId.toString(), context)
              : null,
            cancellationReason: consent.revocationReason,
          });
        }

        if (consent.voidedAt) {
          allItems.push({
            ...baseEvent,
            id: `${consentId}_voided`,
            type: PATIENT_ACTIVITY_TYPES.CONSENT_VOIDED,
            occurredAt: consent.voidedAt.toISOString(),
            title: 'Consentement invalidé',
            subtitle: consent.titleSnapshot,
            detail: consent.voidReason,
            actor: consent.voidedByUserId
              ? this.formatActor(consent.voidedByUserId.toString(), context)
              : null,
            cancellationReason: consent.voidReason,
          });
        }
      }

      for (const document of visibility.generatedDocuments ? (records.generatedDocuments ?? []) : []) {
        const documentId = document._id.toString();
        const baseEvent = {
          category: PATIENT_ACTIVITY_CATEGORIES.DOCUMENT,
          treatment: null,
          appointmentId: null,
          clinicalVisitId: null,
          cashRecordId: null,
          receiptId: null,
          mediaId: null,
          amountMinor: null,
          currency: null,
          receiptNumber: null,
          scheduledAt: null,
          recommendedAt: null,
          targetType: PATIENT_ACTIVITY_TARGETS.GENERATED_DOCUMENT,
          targetId: documentId,
        };
        allItems.push({
          ...baseEvent,
          id: `${documentId}_finalized`,
          type: PATIENT_ACTIVITY_TYPES.GENERATED_DOCUMENT_FINALIZED,
          occurredAt: document.generatedAt.toISOString(),
          title: 'Document finalisé',
          subtitle: document.titleSnapshot,
          detail: `${document.documentRef} · v${document.templateVersion}`,
          actor: this.formatActor(document.generatedByUserId.toString(), context),
          cancellationReason: null,
        });
        if (document.voidedAt) {
          allItems.push({
            ...baseEvent,
            id: `${documentId}_voided`,
            type: PATIENT_ACTIVITY_TYPES.GENERATED_DOCUMENT_VOIDED,
            occurredAt: document.voidedAt.toISOString(),
            title: 'Document invalidé',
            subtitle: document.titleSnapshot,
            detail: document.voidReason,
            actor: document.voidedByUserId
              ? this.formatActor(document.voidedByUserId.toString(), context)
              : null,
            cancellationReason: document.voidReason,
          });
        }
        if (document.status === 'EXPIRED' || document.deletedAt) {
          const expiredOccurredAt = (document.deletedAt ?? document.retentionExpiresAt ?? new Date()).toISOString();
          allItems.push({
            ...baseEvent,
            id: `${documentId}_expired`,
            type: PATIENT_ACTIVITY_TYPES.GENERATED_DOCUMENT_EXPIRED,
            occurredAt: expiredOccurredAt,
            title: 'Document supprimé après expiration',
            subtitle: document.titleSnapshot,
            detail: `${document.documentRef} · Fichier PDF supprimé automatiquement après 30 jours`,
            actor: null,
            cancellationReason: null,
          });
        }
      }
    }

    // Deterministic chronological ordering (newest first)
    allItems.sort((a, b) => {
      const timeDiff = new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });

    const total = allItems.length;
    const paginatedItems = allItems.slice(pagination.skip, pagination.skip + pagination.limit);

    return {
      result: {
        items: paginatedItems,
        total,
      },
      pagination,
    };
  }

  private formatActor(
    userId: string,
    context: PatientActivityContext,
  ): { id?: string; displayName: string; role: never } | null {
    const user = context.users.get(userId);
    if (!user) return null;
    const membership = context.memberships.get(userId);
    const role = (membership?.role ?? null) as never;
    return {
      id: userId,
      displayName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      role,
    };
  }

  private visibilityFor(tenant: TenantContext): PatientActivityVisibility {
    const appointments = hasPermission(tenant, PERMISSIONS.APPOINTMENT_READ);
    const clinical =
      hasPermission(tenant, PERMISSIONS.CLINICAL_VISIT_READ) ||
      hasPermission(tenant, PERMISSIONS.PATIENT_READ);
    const clinicalDetails =
      hasPermission(tenant, PERMISSIONS.CLINICAL_VISIT_MANAGE) ||
      hasPermission(tenant, PERMISSIONS.CLINICAL_VISIT_EDIT_COMPLETED);
    const followUps = hasPermission(tenant, PERMISSIONS.FOLLOW_UP_READ);
    const payments = hasPermission(tenant, PERMISSIONS.CASH_RECORD_READ);
    const documents = hasPermission(tenant, PERMISSIONS.PATIENT_MEDIA_READ);
    const consents = hasPermission(tenant, PERMISSIONS.CONSENT_READ);
    const generatedDocuments = hasPermission(tenant, PERMISSIONS.GENERATED_DOCUMENT_READ);

    return {
      appointments,
      clinical,
      clinicalDetails,
      followUps,
      payments,
      documents,
      generatedDocuments,
      consents,
    };
  }
}

export const patientActivityService = new PatientActivityService();

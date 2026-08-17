import type { QueryFilter, Types } from 'mongoose';
import { toObjectId } from '../../common/utils/object-id.js';
import { AppointmentModel } from '../appointments/appointment.model.js';
import type { AppointmentRecord } from '../appointments/appointment.types.js';
import { AppointmentTypeModel } from '../appointment-types/appointment-type.model.js';
import type { AppointmentTypeRecord } from '../appointment-types/appointment-type.types.js';
import { AuditLogModel } from '../audit-logs/audit-log.model.js';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  type AuditLogAttributes,
  type AuditLogRecord,
} from '../audit-logs/audit-log.types.js';
import { CashRecordModel } from '../cash-records/cash-record.model.js';
import type { CashRecordRecord } from '../cash-records/cash-record.types.js';
import { ClinicalVisitModel } from '../clinical-visits/clinical-visit.model.js';
import {
  CLINICAL_VISIT_STATUSES,
  type ClinicalVisitRecord,
} from '../clinical-visits/clinical-visit.types.js';
import { ClinicMembershipModel } from '../memberships/membership.model.js';
import type { MembershipRecord } from '../memberships/membership.types.js';
import { PatientMediaModel } from '../patient-media/patient-media.model.js';
import type { PatientMediaRecord } from '../patient-media/patient-media.types.js';
import { ReceiptModel } from '../receipts/receipt.model.js';
import type { ReceiptRecord } from '../receipts/receipt.types.js';
import { TreatmentModel } from '../treatments/treatment.model.js';
import type { TreatmentRecord } from '../treatments/treatment.types.js';
import { UserModel } from '../users/user.model.js';
import type { SafeUserRecord } from '../users/user.types.js';
import {
  PATIENT_ACTIVITY_FILTERS,
  type PatientActivityFilter,
  type PatientActivityVisibility,
} from './patient-activity.types.js';

export interface PatientActivityAuditResult {
  items: AuditLogRecord[];
  total: number;
}

export interface PatientActivityFollowUpResult {
  items: ClinicalVisitRecord[];
  total: number;
}

export interface PatientActivityContext {
  appointments: Map<string, AppointmentRecord>;
  appointmentTypes: Map<string, AppointmentTypeRecord>;
  treatments: Map<string, TreatmentRecord>;
  visits: Map<string, ClinicalVisitRecord>;
  cashRecords: Map<string, CashRecordRecord>;
  receipts: Map<string, ReceiptRecord>;
  media: Map<string, PatientMediaRecord>;
  users: Map<string, SafeUserRecord>;
  memberships: Map<string, MembershipRecord>;
}

type AuditCriterion = Record<string, unknown>;

/**
 * Bounded, clinic-scoped reads that back the Patient Activity projection.
 * Existing domain collections and their append-only audit events remain the
 * source of truth; this repository never writes or materializes a timeline.
 */
export class PatientActivityRepository {
  async listAudits(
    clinicId: string,
    patientId: string,
    filter: PatientActivityFilter,
    visibility: PatientActivityVisibility,
    limit: number,
  ): Promise<PatientActivityAuditResult> {
    const criteria = this.eventCriteria(filter, visibility);
    if (criteria.length === 0) return { items: [], total: 0 };

    const clinicObjectId = toObjectId(clinicId, 'clinicId');
    const patientObjectId = toObjectId(patientId, 'patientId');
    const needsAppointments = this.includesDomain(filter, PATIENT_ACTIVITY_FILTERS.APPOINTMENTS);
    const needsClinical = this.includesDomain(filter, PATIENT_ACTIVITY_FILTERS.CLINICAL);
    const [appointmentIds, visitIds] = await Promise.all([
      needsAppointments && visibility.appointments
        ? AppointmentModel.distinct('_id', { clinicId: clinicObjectId, patientId: patientObjectId })
        : Promise.resolve([] as Types.ObjectId[]),
      needsClinical && visibility.clinical
        ? ClinicalVisitModel.distinct('_id', {
            clinicId: clinicObjectId,
            patientId: patientObjectId,
          })
        : Promise.resolve([] as Types.ObjectId[]),
    ]);

    const patientScope: AuditCriterion[] = [{ 'metadata.patientId': patientId }];
    if (appointmentIds.length > 0) {
      patientScope.push({
        resourceType: AUDIT_RESOURCE_TYPES.APPOINTMENT,
        resourceId: { $in: appointmentIds },
      });
    }
    if (visitIds.length > 0) {
      patientScope.push({
        resourceType: AUDIT_RESOURCE_TYPES.CLINICAL_VISIT,
        resourceId: { $in: visitIds },
      });
    }

    const query = {
      clinicId: clinicObjectId,
      $and: [{ $or: criteria }, { $or: patientScope }],
    } as QueryFilter<AuditLogAttributes>;

    const [items, total] = await Promise.all([
      AuditLogModel.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean<AuditLogRecord[]>()
        .exec(),
      AuditLogModel.countDocuments(query).exec(),
    ]);
    return { items, total };
  }

  async listFollowUps(
    clinicId: string,
    patientId: string,
    filter: PatientActivityFilter,
    visible: boolean,
    limit: number,
  ): Promise<PatientActivityFollowUpResult> {
    if (!visible || !this.includesDomain(filter, PATIENT_ACTIVITY_FILTERS.CLINICAL)) {
      return { items: [], total: 0 };
    }
    const query = {
      clinicId: toObjectId(clinicId, 'clinicId'),
      patientId: toObjectId(patientId, 'patientId'),
      status: CLINICAL_VISIT_STATUSES.COMPLETED,
      completedAt: { $ne: null },
      nextVisitRecommendedAt: { $ne: null },
    };
    const [items, total] = await Promise.all([
      ClinicalVisitModel.find(query)
        .sort({ completedAt: -1, _id: -1 })
        .limit(limit)
        .lean<ClinicalVisitRecord[]>()
        .exec(),
      ClinicalVisitModel.countDocuments(query).exec(),
    ]);
    return { items, total };
  }

  async loadContext(
    clinicId: string,
    patientId: string,
    audits: AuditLogRecord[],
    followUps: ClinicalVisitRecord[],
  ): Promise<PatientActivityContext> {
    const clinicObjectId = toObjectId(clinicId, 'clinicId');
    const patientObjectId = toObjectId(patientId, 'patientId');
    const idsFor = (resourceType: string): Types.ObjectId[] =>
      audits.flatMap((audit) =>
        audit.resourceType === resourceType && audit.resourceId ? [audit.resourceId] : [],
      );
    const scoped = { clinicId: clinicObjectId, patientId: patientObjectId };

    const [appointments, directTreatments, visits, cashRecords, media] = await Promise.all([
      AppointmentModel.find({ ...scoped, _id: { $in: idsFor(AUDIT_RESOURCE_TYPES.APPOINTMENT) } })
        .lean<AppointmentRecord[]>()
        .exec(),
      TreatmentModel.find({ ...scoped, _id: { $in: idsFor(AUDIT_RESOURCE_TYPES.TREATMENT) } })
        .lean<TreatmentRecord[]>()
        .exec(),
      ClinicalVisitModel.find({
        ...scoped,
        _id: {
          $in: [
            ...idsFor(AUDIT_RESOURCE_TYPES.CLINICAL_VISIT),
            ...followUps.map((visit) => visit._id),
          ],
        },
      })
        .lean<ClinicalVisitRecord[]>()
        .exec(),
      CashRecordModel.find({ ...scoped, _id: { $in: idsFor(AUDIT_RESOURCE_TYPES.CASH_RECORD) } })
        .lean<CashRecordRecord[]>()
        .exec(),
      PatientMediaModel.find({
        ...scoped,
        _id: { $in: idsFor(AUDIT_RESOURCE_TYPES.PATIENT_MEDIA) },
      })
        .lean<PatientMediaRecord[]>()
        .exec(),
    ]);

    const treatmentIds = new Set<string>(directTreatments.map((record) => record._id.toString()));
    for (const record of [...appointments, ...visits, ...cashRecords, ...media]) {
      if (record.treatmentId) treatmentIds.add(record.treatmentId.toString());
    }
    const actorIds = new Set<string>(
      audits.flatMap((audit) => (audit.actorUserId ? [audit.actorUserId.toString()] : [])),
    );
    for (const visit of followUps) {
      actorIds.add((visit.updatedBy ?? visit.createdBy).toString());
    }

    const [relatedTreatments, appointmentTypes, receipts, users, memberships] = await Promise.all([
      TreatmentModel.find({
        ...scoped,
        _id: { $in: [...treatmentIds].map((id) => toObjectId(id, 'treatmentId')) },
      })
        .lean<TreatmentRecord[]>()
        .exec(),
      AppointmentTypeModel.find({
        clinicId: clinicObjectId,
        _id: { $in: appointments.map((record) => record.appointmentTypeId) },
      })
        .lean<AppointmentTypeRecord[]>()
        .exec(),
      ReceiptModel.find({
        ...scoped,
        cashRecordId: { $in: cashRecords.map((record) => record._id) },
      })
        .lean<ReceiptRecord[]>()
        .exec(),
      UserModel.find({ _id: { $in: [...actorIds].map((id) => toObjectId(id, 'actorUserId')) } })
        .lean<SafeUserRecord[]>()
        .exec(),
      ClinicMembershipModel.find({
        clinicId: clinicObjectId,
        userId: { $in: [...actorIds].map((id) => toObjectId(id, 'actorUserId')) },
      })
        .lean<MembershipRecord[]>()
        .exec(),
    ]);

    const byId = <T extends { _id: Types.ObjectId }>(records: T[]): Map<string, T> =>
      new Map(records.map((record) => [record._id.toString(), record]));
    const roleByUser = new Map(memberships.map((record) => [record.userId.toString(), record]));

    return {
      appointments: byId(appointments),
      appointmentTypes: byId(appointmentTypes),
      treatments: byId(relatedTreatments),
      visits: byId(visits),
      cashRecords: byId(cashRecords),
      receipts: new Map(receipts.map((record) => [record.cashRecordId.toString(), record])),
      media: byId(media),
      users: byId(users),
      memberships: roleByUser,
    };
  }

  private includesDomain(filter: PatientActivityFilter, domain: PatientActivityFilter): boolean {
    return filter === PATIENT_ACTIVITY_FILTERS.ALL || filter === domain;
  }

  private eventCriteria(
    filter: PatientActivityFilter,
    visibility: PatientActivityVisibility,
  ): AuditCriterion[] {
    const criteria: AuditCriterion[] = [];
    if (
      visibility.appointments &&
      this.includesDomain(filter, PATIENT_ACTIVITY_FILTERS.APPOINTMENTS)
    ) {
      criteria.push(
        {
          action: {
            $in: [
              AUDIT_ACTIONS.APPOINTMENT_CREATED,
              AUDIT_ACTIONS.APPOINTMENT_RESCHEDULED,
              AUDIT_ACTIONS.APPOINTMENT_CANCELLED,
              AUDIT_ACTIONS.APPOINTMENT_NO_SHOW,
            ],
          },
        },
        {
          action: AUDIT_ACTIONS.APPOINTMENT_STATUS_CHANGED,
          'metadata.to': { $in: ['ARRIVED', 'WAITING', 'IN_TREATMENT', 'COMPLETED'] },
        },
      );
    }
    if (visibility.clinical && this.includesDomain(filter, PATIENT_ACTIVITY_FILTERS.CLINICAL)) {
      criteria.push(
        {
          action: {
            $in: [
              AUDIT_ACTIONS.TREATMENT_CREATED,
              AUDIT_ACTIONS.TREATMENT_STARTED,
              AUDIT_ACTIONS.TREATMENT_PAUSED,
              AUDIT_ACTIONS.TREATMENT_RESUMED,
              AUDIT_ACTIONS.TREATMENT_COMPLETED,
              AUDIT_ACTIONS.TREATMENT_CANCELLED,
              AUDIT_ACTIONS.CLINICAL_VISIT_COMPLETED,
            ],
          },
        },
        {
          action: AUDIT_ACTIONS.CLINICAL_VISIT_UPDATED,
          'metadata.amendedCompletedVisit': true,
        },
      );
    }
    if (visibility.payments && this.includesDomain(filter, PATIENT_ACTIVITY_FILTERS.PAYMENTS)) {
      criteria.push({
        action: {
          $in: [
            AUDIT_ACTIONS.CASH_RECORD_CREATED,
            AUDIT_ACTIONS.CASH_RECORD_CORRECTED,
            AUDIT_ACTIONS.CASH_RECORD_CANCELLED,
          ],
        },
      });
    }
    if (visibility.documents && this.includesDomain(filter, PATIENT_ACTIVITY_FILTERS.DOCUMENTS)) {
      criteria.push({
        action: {
          $in: [
            AUDIT_ACTIONS.PATIENT_MEDIA_UPLOADED,
            AUDIT_ACTIONS.PATIENT_MEDIA_ARCHIVED,
            AUDIT_ACTIONS.PATIENT_MEDIA_RESTORED,
          ],
        },
      });
    }
    return criteria;
  }
}

export const patientActivityRepository = new PatientActivityRepository();

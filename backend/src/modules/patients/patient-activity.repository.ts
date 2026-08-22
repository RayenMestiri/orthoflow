import { Types } from 'mongoose';
import { toObjectId } from '../../common/utils/object-id.js';
import { AppointmentModel } from '../appointments/appointment.model.js';
import type { AppointmentRecord } from '../appointments/appointment.types.js';
import { AppointmentTypeModel } from '../appointment-types/appointment-type.model.js';
import type { AppointmentTypeRecord } from '../appointment-types/appointment-type.types.js';
import { CashRecordModel } from '../cash-records/cash-record.model.js';
import type { CashRecordRecord } from '../cash-records/cash-record.types.js';
import { ClinicalVisitModel } from '../clinical-visits/clinical-visit.model.js';
import type { ClinicalVisitRecord } from '../clinical-visits/clinical-visit.types.js';
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

export interface DomainRecordsResult {
  appointments: AppointmentRecord[];
  visits: ClinicalVisitRecord[];
  treatments: TreatmentRecord[];
  cashRecords: CashRecordRecord[];
  media: PatientMediaRecord[];
}

export interface PatientActivityContext {
  appointmentTypes: Map<string, AppointmentTypeRecord>;
  treatments: Map<string, TreatmentRecord>;
  receipts: Map<string, ReceiptRecord>;
  users: Map<string, SafeUserRecord>;
  memberships: Map<string, MembershipRecord>;
}

/**
 * High-performance, clinic-scoped reads that back the Patient Activity projection.
 * Direct indexed queries on domain collections are run concurrently via Promise.all.
 * Never persists or duplicates events.
 */
export class PatientActivityRepository {
  async fetchDomainRecords(
    clinicId: string,
    patientId: string,
    filter: PatientActivityFilter,
    visibility: PatientActivityVisibility,
    candidateLimit: number,
  ): Promise<DomainRecordsResult> {
    const clinicObjectId = toObjectId(clinicId, 'clinicId');
    const patientObjectId = toObjectId(patientId, 'patientId');

    const shouldFetchAppointments =
      visibility.appointments &&
      (filter === PATIENT_ACTIVITY_FILTERS.ALL ||
        filter === PATIENT_ACTIVITY_FILTERS.APPOINTMENTS);

    const shouldFetchVisits =
      visibility.clinical &&
      (filter === PATIENT_ACTIVITY_FILTERS.ALL ||
        filter === PATIENT_ACTIVITY_FILTERS.CLINICAL);

    const shouldFetchTreatments =
      visibility.clinical &&
      (filter === PATIENT_ACTIVITY_FILTERS.ALL ||
        filter === PATIENT_ACTIVITY_FILTERS.CLINICAL);

    const shouldFetchPayments =
      visibility.payments &&
      (filter === PATIENT_ACTIVITY_FILTERS.ALL ||
        filter === PATIENT_ACTIVITY_FILTERS.PAYMENTS);

    const shouldFetchMedia =
      visibility.documents &&
      (filter === PATIENT_ACTIVITY_FILTERS.ALL ||
        filter === PATIENT_ACTIVITY_FILTERS.DOCUMENTS);

    const [appointments, visits, treatments, cashRecords, media] = await Promise.all([
      shouldFetchAppointments
        ? AppointmentModel.find({ clinicId: clinicObjectId, patientId: patientObjectId })
            .sort({ startAt: -1, createdAt: -1 })
            .limit(candidateLimit)
            .lean<AppointmentRecord[]>()
            .exec()
        : Promise.resolve([]),

      shouldFetchVisits
        ? ClinicalVisitModel.find({ clinicId: clinicObjectId, patientId: patientObjectId })
            .sort({ completedAt: -1, createdAt: -1 })
            .limit(candidateLimit)
            .lean<ClinicalVisitRecord[]>()
            .exec()
        : Promise.resolve([]),

      shouldFetchTreatments
        ? TreatmentModel.find({ clinicId: clinicObjectId, patientId: patientObjectId })
            .sort({ createdAt: -1 })
            .limit(candidateLimit)
            .lean<TreatmentRecord[]>()
            .exec()
        : Promise.resolve([]),

      shouldFetchPayments
        ? CashRecordModel.find({ clinicId: clinicObjectId, patientId: patientObjectId })
            .sort({ receivedAt: -1, createdAt: -1 })
            .limit(candidateLimit)
            .lean<CashRecordRecord[]>()
            .exec()
        : Promise.resolve([]),

      shouldFetchMedia
        ? PatientMediaModel.find({ clinicId: clinicObjectId, patientId: patientObjectId })
            .sort({ createdAt: -1 })
            .limit(candidateLimit)
            .lean<PatientMediaRecord[]>()
            .exec()
        : Promise.resolve([]),
    ]);

    return {
      appointments,
      visits,
      treatments,
      cashRecords,
      media,
    };
  }

  async loadContext(
    clinicId: string,
    records: DomainRecordsResult,
  ): Promise<PatientActivityContext> {
    const clinicObjectId = toObjectId(clinicId, 'clinicId');

    const userIds = new Set<string>();
    const appointmentTypeIds = new Set<string>();
    const treatmentIds = new Set<string>();
    const receiptIds = new Set<string>();

    for (const appt of records.appointments) {
      if (appt.createdBy) userIds.add(appt.createdBy.toString());
      if (appt.updatedBy) userIds.add(appt.updatedBy.toString());
      if (appt.appointmentTypeId) appointmentTypeIds.add(appt.appointmentTypeId.toString());
      if (appt.treatmentId) treatmentIds.add(appt.treatmentId.toString());
    }

    for (const visit of records.visits) {
      if (visit.createdBy) userIds.add(visit.createdBy.toString());
      if (visit.updatedBy) userIds.add(visit.updatedBy.toString());
      if (visit.treatmentId) treatmentIds.add(visit.treatmentId.toString());
    }

    for (const trt of records.treatments) {
      if (trt.createdBy) userIds.add(trt.createdBy.toString());
      if (trt.updatedBy) userIds.add(trt.updatedBy.toString());
      treatmentIds.add(trt._id.toString());
    }

    for (const cash of records.cashRecords) {
      if (cash.receivedByUserId) userIds.add(cash.receivedByUserId.toString());
      if (cash.createdBy) userIds.add(cash.createdBy.toString());
      if (cash.cancelledBy) userIds.add(cash.cancelledBy.toString());
      if (cash.treatmentId) treatmentIds.add(cash.treatmentId.toString());
      if (cash.receiptId) receiptIds.add(cash.receiptId.toString());
    }

    for (const item of records.media) {
      if (item.uploadedByUserId) userIds.add(item.uploadedByUserId.toString());
      if (item.treatmentId) treatmentIds.add(item.treatmentId.toString());
    }

    const userObjectIds = Array.from(userIds).map((id) => new Types.ObjectId(id));
    const typeObjectIds = Array.from(appointmentTypeIds).map((id) => new Types.ObjectId(id));
    const treatmentObjectIds = Array.from(treatmentIds).map((id) => new Types.ObjectId(id));
    const receiptObjectIds = Array.from(receiptIds).map((id) => new Types.ObjectId(id));

    const [users, memberships, appointmentTypes, treatments, receipts] = await Promise.all([
      userObjectIds.length > 0
        ? UserModel.find({ _id: { $in: userObjectIds } })
            .select('_id firstName lastName email platformRole')
            .lean<SafeUserRecord[]>()
            .exec()
        : Promise.resolve([]),

      userObjectIds.length > 0
        ? ClinicMembershipModel.find({
            clinicId: clinicObjectId,
            userId: { $in: userObjectIds },
          })
            .select('_id userId role status')
            .lean<MembershipRecord[]>()
            .exec()
        : Promise.resolve([]),

      typeObjectIds.length > 0
        ? AppointmentTypeModel.find({ _id: { $in: typeObjectIds } })
            .select('_id name code')
            .lean<AppointmentTypeRecord[]>()
            .exec()
        : Promise.resolve([]),

      treatmentObjectIds.length > 0
        ? TreatmentModel.find({ _id: { $in: treatmentObjectIds } })
            .select('_id type customTypeLabel status')
            .lean<TreatmentRecord[]>()
            .exec()
        : Promise.resolve([]),

      receiptObjectIds.length > 0
        ? ReceiptModel.find({ _id: { $in: receiptObjectIds } })
            .select('_id receiptNumber issuedAt')
            .lean<ReceiptRecord[]>()
            .exec()
        : Promise.resolve([]),
    ]);

    return {
      users: new Map(users.map((u) => [u._id.toString(), u])),
      memberships: new Map(memberships.map((m) => [m.userId.toString(), m])),
      appointmentTypes: new Map(appointmentTypes.map((t) => [t._id.toString(), t])),
      treatments: new Map(treatments.map((t) => [t._id.toString(), t])),
      receipts: new Map(receipts.map((r) => [r._id.toString(), r])),
    };
  }
}

export const patientActivityRepository = new PatientActivityRepository();

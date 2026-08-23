import { Types } from 'mongoose';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { ForbiddenError, NotFoundError } from '../../common/errors/app-error.js';
import { AppointmentModel } from '../appointments/appointment.model.js';
import type { AppointmentRecord, AppointmentStatus } from '../appointments/appointment.types.js';
import { AppointmentTypeModel } from '../appointment-types/appointment-type.model.js';
import { CashRecordModel } from '../cash-records/cash-record.model.js';
import { CASH_RECORD_STATUSES, type CashRecordRecord } from '../cash-records/cash-record.types.js';
import { financialSummaryService } from '../cash-records/financial-summary.service.js';
import { ClinicModel } from '../clinics/clinic.model.js';
import type { ClinicRecord } from '../clinics/clinic.types.js';
import { ClinicalVisitModel } from '../clinical-visits/clinical-visit.model.js';
import type { ClinicalVisitRecord } from '../clinical-visits/clinical-visit.types.js';
import { consentService } from '../consents/consent.service.js';
import { SignedConsentModel } from '../consents/consent.model.js';
import type { SignedConsentRecord } from '../consents/consent.types.js';
import { GeneratedDocumentModel } from '../generated-documents/generated-document.model.js';
import type { GeneratedDocumentRecord } from '../generated-documents/generated-document.types.js';
import { generatedDocumentService } from '../generated-documents/generated-document.service.js';
import { PatientGuardianModel } from '../guardians/patient-guardian.model.js';
import type { PatientGuardianRecord } from '../guardians/guardian.types.js';
import { PatientModel } from '../patients/patient.model.js';
import type { PatientRecord } from '../patients/patient.types.js';
import { receiptService } from '../receipts/receipt.service.js';
import { RetentionPlanModel } from '../retention/retention.model.js';
import type { RetentionPlanRecord } from '../retention/retention.types.js';
import { TreatmentModel } from '../treatments/treatment.model.js';
import type { TreatmentRecord } from '../treatments/treatment.types.js';
import { portalRepository } from './portal.repository.js';
import { auditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import type {
  AuthenticatedPortalUser,
  PortalAppointmentDto,
  PortalAppointmentStatus,
  PortalChildOverviewDto,
  PortalChildSummaryDto,
  PortalReceiptDto,
  PortalVisitSummaryDto,
} from './portal.types.js';

const oid = (value: string) => new Types.ObjectId(value);
const treatmentLabel = (record: TreatmentRecord) =>
  record.customTypeLabel ||
  record.type
    .toLowerCase()
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
const birthDate = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
function age(value: Date | null): number | null {
  if (!value) return null;
  const now = new Date();
  let result = now.getUTCFullYear() - value.getUTCFullYear();
  if (
    now.getUTCMonth() < value.getUTCMonth() ||
    (now.getUTCMonth() === value.getUTCMonth() && now.getUTCDate() < value.getUTCDate())
  )
    result--;
  return result;
}
export function toPortalAppointmentStatus(status: AppointmentStatus): PortalAppointmentStatus {
  if (['ARRIVED', 'WAITING', 'IN_TREATMENT'].includes(status)) return 'VISIT_IN_PROGRESS';
  if (status === 'NO_SHOW') return 'MISSED';
  return status as PortalAppointmentStatus;
}

export class PortalReadService {
  async relationships(user: AuthenticatedPortalUser): Promise<PatientGuardianRecord[]> {
    return PatientGuardianModel.find({
      clinicId: oid(user.clinicId),
      guardianId: oid(user.guardianId),
    })
      .lean<PatientGuardianRecord[]>()
      .exec();
  }

  async requireChild(
    user: AuthenticatedPortalUser,
    patientId: string,
  ): Promise<PatientGuardianRecord> {
    const relation = await PatientGuardianModel.findOne({
      clinicId: oid(user.clinicId),
      guardianId: oid(user.guardianId),
      patientId: oid(patientId),
    })
      .lean<PatientGuardianRecord | null>()
      .exec();
    if (!relation)
      throw new NotFoundError('Child record not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    return relation;
  }

  async children(user: AuthenticatedPortalUser): Promise<PortalChildSummaryDto[]> {
    const relations = await this.relationships(user);
    if (!relations.length) return [];
    const ids = relations.map((item) => item.patientId);
    const [patients, treatments, appointments, clinic] = await Promise.all([
      PatientModel.find({ clinicId: oid(user.clinicId), _id: { $in: ids } })
        .lean<PatientRecord[]>()
        .exec(),
      TreatmentModel.find({
        clinicId: oid(user.clinicId),
        patientId: { $in: ids },
        status: { $in: ['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED'] },
      })
        .sort({ createdAt: -1 })
        .lean<TreatmentRecord[]>()
        .exec(),
      AppointmentModel.find({
        clinicId: oid(user.clinicId),
        patientId: { $in: ids },
        startAt: { $gte: new Date() },
        status: { $in: ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'WAITING', 'IN_TREATMENT'] },
      })
        .sort({ startAt: 1 })
        .lean<AppointmentRecord[]>()
        .exec(),
      ClinicModel.findById(oid(user.clinicId)).lean<ClinicRecord | null>().exec(),
    ]);
    if (!clinic) return [];
    const treatmentIds = treatments.map((item) => item._id);
    const [retentions, appointmentTypes] = await Promise.all([
      RetentionPlanModel.find({
        clinicId: oid(user.clinicId),
        treatmentId: { $in: treatmentIds },
        status: { $in: ['PLANNED', 'ACTIVE'] },
      })
        .sort({ createdAt: -1 })
        .lean<RetentionPlanRecord[]>()
        .exec(),
      AppointmentTypeModel.find({
        clinicId: oid(user.clinicId),
        _id: { $in: appointments.map((item) => item.appointmentTypeId) },
      })
        .lean()
        .exec(),
    ]);
    const relationByPatient = new Map(relations.map((item) => [item.patientId.toString(), item]));
    const treatmentByPatient = new Map<string, TreatmentRecord>();
    for (const item of treatments)
      if (!treatmentByPatient.has(item.patientId.toString()))
        treatmentByPatient.set(item.patientId.toString(), item);
    const retentionByTreatment = new Map(
      retentions.map((item) => [item.treatmentId.toString(), item]),
    );
    const nextByPatient = new Map<string, AppointmentRecord>();
    for (const item of appointments)
      if (!nextByPatient.has(item.patientId.toString()))
        nextByPatient.set(item.patientId.toString(), item);
    const typeById = new Map(appointmentTypes.map((item) => [String(item._id), String(item.name)]));
    return patients
      .sort((a, b) => a.firstName.localeCompare(b.firstName))
      .map((patient) => {
        const id = patient._id.toString();
        const relation = relationByPatient.get(id)!;
        const treatment = treatmentByPatient.get(id) ?? null;
        const retention = treatment
          ? (retentionByTreatment.get(treatment._id.toString()) ?? null)
          : null;
        const appointment = nextByPatient.get(id) ?? null;
        return {
          id,
          fullName: `${patient.firstName} ${patient.lastName}`.trim(),
          birthDate: birthDate(patient.birthDate),
          age: age(patient.birthDate),
          relationship: relation.relationship,
          canViewFinance: relation.financiallyResponsible,
          treatment: treatment
            ? {
                label: treatmentLabel(treatment),
                status: treatment.status,
                startDate: birthDate(treatment.startDate),
                expectedEndDate: birthDate(treatment.expectedEndDate),
                completionDate: birthDate(treatment.completionDate ?? treatment.completedAt),
              }
            : null,
          retention: retention
            ? {
                status: retention.status,
                nextRecommendedControlAt: birthDate(retention.initialControlRecommendedAt),
              }
            : null,
          nextAppointment: appointment
            ? this.appointmentDto(
                appointment,
                `${patient.firstName} ${patient.lastName}`.trim(),
                typeById.get(appointment.appointmentTypeId.toString()) ?? 'Appointment',
                treatment,
              )
            : null,
        };
      });
  }

  async overview(
    user: AuthenticatedPortalUser,
    patientId: string,
  ): Promise<PortalChildOverviewDto> {
    await this.requireChild(user, patientId);
    const [children, visit, clinic] = await Promise.all([
      this.children(user),
      ClinicalVisitModel.findOne({
        clinicId: oid(user.clinicId),
        patientId: oid(patientId),
        status: 'COMPLETED',
      })
        .sort({ completedAt: -1 })
        .lean<ClinicalVisitRecord | null>()
        .exec(),
      ClinicModel.findById(oid(user.clinicId)).lean<ClinicRecord | null>().exec(),
    ]);
    const child = children.find((item) => item.id === patientId);
    if (!child || !clinic)
      throw new NotFoundError('Child record not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    const latestVisit: PortalVisitSummaryDto | null = visit
      ? {
          id: visit._id.toString(),
          visitAt: (visit.completedAt ?? visit.startedAt).toISOString(),
          visitLabel: visit.reasonCode
            ? visit.reasonCode.toLowerCase().replaceAll('_', ' ')
            : 'Clinical visit',
          patientInstructions: visit.patientInstructions,
          nextRecommendedVisitAt: visit.nextVisitRecommendedAt?.toISOString() ?? null,
        }
      : null;
    return {
      child,
      latestVisit,
      clinic: {
        name: clinic.name,
        phone: clinic.phone,
        email: clinic.email,
        timezone: clinic.timezone,
        currency: clinic.currency,
      },
    };
  }

  async appointments(user: AuthenticatedPortalUser): Promise<PortalAppointmentDto[]> {
    const relations = await this.relationships(user);
    if (!relations.length) return [];
    const ids = relations.map((item) => item.patientId);
    const [records, patients, types, treatments] = await Promise.all([
      AppointmentModel.find({
        clinicId: oid(user.clinicId),
        patientId: { $in: ids },
        startAt: { $gte: new Date(Date.now() - 180 * 86400000) },
      })
        .sort({ startAt: 1 })
        .limit(200)
        .lean<AppointmentRecord[]>()
        .exec(),
      PatientModel.find(
        { clinicId: oid(user.clinicId), _id: { $in: ids } },
        { firstName: 1, lastName: 1 },
      )
        .lean()
        .exec(),
      AppointmentTypeModel.find({ clinicId: oid(user.clinicId) })
        .lean()
        .exec(),
      TreatmentModel.find({ clinicId: oid(user.clinicId), patientId: { $in: ids } })
        .lean<TreatmentRecord[]>()
        .exec(),
    ]);
    const names = new Map(
      patients.map((item) => [String(item._id), `${item.firstName} ${item.lastName}`.trim()]),
    );
    const typeNames = new Map(types.map((item) => [String(item._id), String(item.name)]));
    const treatmentById = new Map(treatments.map((item) => [item._id.toString(), item]));
    return records.map((item) =>
      this.appointmentDto(
        item,
        names.get(item.patientId.toString()) ?? 'Child',
        typeNames.get(item.appointmentTypeId.toString()) ?? 'Appointment',
        item.treatmentId ? (treatmentById.get(item.treatmentId.toString()) ?? null) : null,
      ),
    );
  }

  async finance(user: AuthenticatedPortalUser, patientId: string) {
    const relation = await this.requireChild(user, patientId);
    if (!relation.financiallyResponsible)
      throw new ForbiddenError(
        'Financial information is limited to the financially responsible guardian',
        { code: ERROR_CODES.PORTAL_FINANCE_ACCESS_DENIED },
      );
    const treatment = await TreatmentModel.findOne({
      clinicId: oid(user.clinicId),
      patientId: oid(patientId),
      status: { $in: ['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED'] },
    })
      .sort({ createdAt: -1 })
      .lean<TreatmentRecord | null>()
      .exec();
    const [summary, records] = await Promise.all([
      treatment
        ? financialSummaryService.forTreatment(user.clinicId, treatment._id.toString())
        : financialSummaryService.forPatient(user.clinicId, patientId),
      CashRecordModel.find({ clinicId: oid(user.clinicId), patientId: oid(patientId) })
        .sort({ receivedAt: -1 })
        .limit(100)
        .lean<CashRecordRecord[]>()
        .exec(),
    ]);
    return {
      summary,
      payments: records.map((item) => ({
        id: item._id.toString(),
        amountMinor: item.amountMinor,
        currency: item.currency,
        paymentMethod: item.paymentMethod,
        receivedAt: item.receivedAt.toISOString(),
        status: item.status,
        receiptId: item.receiptId?.toString() ?? null,
        countsTowardBalance: item.status === CASH_RECORD_STATUSES.RECORDED,
      })),
    };
  }

  async receipt(
    user: AuthenticatedPortalUser,
    patientId: string,
    receiptId: string,
  ): Promise<PortalReceiptDto> {
    await this.finance(user, patientId);
    const receipt = await receiptService.getById(user.clinicId, receiptId);
    if (receipt.patientId !== patientId)
      throw new NotFoundError('Receipt not found', { code: ERROR_CODES.RECEIPT_NOT_FOUND });
    await auditLogService.recordSafe({
      clinicId: user.clinicId,
      actorPortalUserId: user.id,
      actorKind: 'PORTAL',
      action: AUDIT_ACTIONS.PORTAL_RECEIPT_VIEWED,
      resourceType: AUDIT_RESOURCE_TYPES.RECEIPT,
      resourceId: receiptId,
      metadata: { patientId },
    });
    return {
      receiptNumber: receipt.receiptNumber,
      amountMinor: receipt.amountMinor,
      amountFormatted: receipt.amountFormatted,
      currency: receipt.currency,
      paymentMethod: receipt.paymentMethod,
      issuedAt: receipt.issuedAt,
      status: receipt.status,
      clinicName: receipt.clinicName,
      clinicAddress: receipt.clinicAddress,
      clinicPhone: receipt.clinicPhone,
      patientName: receipt.patientName,
      treatmentLabel: receipt.treatmentLabel,
      payerName: receipt.payerName,
      cancellationReason: receipt.cancellationReason,
    };
  }

  async documents(user: AuthenticatedPortalUser) {
    const relations = await this.relationships(user);
    const ids = relations.map((item) => item.patientId.toString());
    if (!ids.length) return [];
    const shares = await portalRepository.listSharedDocuments(user.clinicId, user.guardianId, ids);
    const records = await GeneratedDocumentModel.find({
      clinicId: oid(user.clinicId),
      patientId: { $in: ids.map(oid) },
      _id: { $in: shares.map((item) => item.generatedDocumentId) },
    })
      .lean<GeneratedDocumentRecord[]>()
      .exec();
    const byId = new Map(records.map((item) => [item._id.toString(), item]));
    return shares.flatMap((share) => {
      const item = byId.get(share.generatedDocumentId.toString());
      return item
        ? [
            {
              id: item._id.toString(),
              patientId: item.patientId.toString(),
              title: item.titleSnapshot,
              category: item.category,
              status: item.status,
              generatedAt: item.generatedAt.toISOString(),
              sharedAt: share.sharedAt.toISOString(),
              downloadPath: `/portal/children/${item.patientId.toString()}/documents/${item._id.toString()}/pdf`,
            },
          ]
        : [];
    });
  }
  async downloadDocument(user: AuthenticatedPortalUser, patientId: string, documentId: string) {
    await this.requireChild(user, patientId);
    if (
      !(await portalRepository.findDocumentShare(
        user.clinicId,
        user.guardianId,
        patientId,
        documentId,
      ))
    )
      throw new NotFoundError('Shared document not found', {
        code: ERROR_CODES.PORTAL_DOCUMENT_NOT_SHARED,
      });
    const file = await generatedDocumentService.downloadPdf(user.clinicId, documentId);
    await auditLogService.recordSafe({
      clinicId: user.clinicId,
      actorPortalUserId: user.id,
      actorKind: 'PORTAL',
      action: AUDIT_ACTIONS.PORTAL_DOCUMENT_DOWNLOADED,
      resourceType: AUDIT_RESOURCE_TYPES.GENERATED_DOCUMENT,
      resourceId: documentId,
      metadata: { patientId },
    });
    return file;
  }

  async consents(user: AuthenticatedPortalUser, patientId: string) {
    await this.requireChild(user, patientId);
    const records = await SignedConsentModel.find({
      clinicId: oid(user.clinicId),
      patientId: oid(patientId),
      guardianId: oid(user.guardianId),
    })
      .sort({ signedAt: -1 })
      .lean<SignedConsentRecord[]>()
      .exec();
    return records.map((item) => ({
      id: item._id.toString(),
      patientId,
      title: item.titleSnapshot,
      category: item.category,
      status: item.status,
      signedAt: item.signedAt.toISOString(),
      signerName: item.signerNameSnapshot,
      downloadPath: `/portal/children/${patientId}/consents/${item._id.toString()}/pdf`,
    }));
  }
  async downloadConsent(user: AuthenticatedPortalUser, patientId: string, consentId: string) {
    await this.requireChild(user, patientId);
    const record = await SignedConsentModel.findOne({
      _id: oid(consentId),
      clinicId: oid(user.clinicId),
      patientId: oid(patientId),
      guardianId: oid(user.guardianId),
    })
      .lean<SignedConsentRecord | null>()
      .exec();
    if (!record)
      throw new NotFoundError('Consent not found', { code: ERROR_CODES.CONSENT_NOT_FOUND });
    const file = await consentService.downloadPdf(user.clinicId, consentId);
    await auditLogService.recordSafe({
      clinicId: user.clinicId,
      actorPortalUserId: user.id,
      actorKind: 'PORTAL',
      action: AUDIT_ACTIONS.PORTAL_CONSENT_DOWNLOADED,
      resourceType: AUDIT_RESOURCE_TYPES.CONSENT,
      resourceId: consentId,
      metadata: { patientId },
    });
    return file;
  }

  private appointmentDto(
    record: AppointmentRecord,
    childName: string,
    typeLabel: string,
    treatment: TreatmentRecord | null,
  ): PortalAppointmentDto {
    return {
      id: record._id.toString(),
      patientId: record.patientId.toString(),
      childName,
      startAt: record.startAt.toISOString(),
      endAt: record.endAt.toISOString(),
      typeLabel,
      treatmentLabel: treatment ? treatmentLabel(treatment) : null,
      status: toPortalAppointmentStatus(record.status),
    };
  }
}
export const portalReadService = new PortalReadService();

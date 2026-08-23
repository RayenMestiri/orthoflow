import { BusinessRuleError, NotFoundError, ValidationError } from '../../common/errors/app-error.js';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { formatMinor } from '../../common/utils/money.js';
import { patientRepository, type PatientRepository } from '../patients/patient.repository.js';
import { guardianRepository, type GuardianRepository } from '../guardians/guardian.repository.js';
import { patientGuardianRepository, type PatientGuardianRepository } from '../guardians/patient-guardian.repository.js';
import { treatmentRepository, type TreatmentRepository } from '../treatments/treatment.repository.js';
import { retentionRepository, type RetentionRepository } from '../retention/retention.repository.js';
import { appointmentRepository, type AppointmentRepository } from '../appointments/appointment.repository.js';
import { appointmentTypeRepository, type AppointmentTypeRepository } from '../appointment-types/appointment-type.repository.js';
import { cashRecordRepository, type CashRecordRepository } from '../cash-records/cash-record.repository.js';
import { receiptRepository, type ReceiptRepository } from '../receipts/receipt.repository.js';
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import { APPOINTMENT_STATUSES } from '../appointments/appointment.types.js';
import { countsTowardTotal } from '../cash-records/cash-record.types.js';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_TABLE_SOURCES,
  type DocumentCategory,
  type DocumentContextSelection,
  type DocumentTableSource,
  type GeneratedDocumentContextSnapshot,
  type ResolvedDocumentRow,
} from './generated-document.types.js';

export interface ResolvedDocumentContext {
  snapshot: GeneratedDocumentContextSnapshot;
  values: Record<string, string | null>;
  tables: Partial<Record<DocumentTableSource, ResolvedDocumentRow[]>>;
  generatedAt: Date;
  generatedAtLabel: string;
  generatedByName: string;
  clinicBranding: { clinicName: string; address: string | null; phone: string | null; email: string | null; doctorName: string | null };
}

function fullName(person: { firstName: string; lastName: string }): string { return `${person.firstName} ${person.lastName}`.trim(); }
function isoDate(value: Date | null | undefined): string | null { return value ? value.toISOString().slice(0, 10) : null; }
function label(value: string | null | undefined): string | null { return value ? value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : null; }
function requireContext(condition: boolean, message: string): asserts condition { if (!condition) throw new ValidationError(message, { code: ERROR_CODES.DOCUMENT_CONTEXT_INVALID }); }

export class DocumentContextService {
  constructor(
    private readonly patients: PatientRepository = patientRepository,
    private readonly guardians: GuardianRepository = guardianRepository,
    private readonly relationships: PatientGuardianRepository = patientGuardianRepository,
    private readonly treatments: TreatmentRepository = treatmentRepository,
    private readonly retention: RetentionRepository = retentionRepository,
    private readonly appointments: AppointmentRepository = appointmentRepository,
    private readonly appointmentTypes: AppointmentTypeRepository = appointmentTypeRepository,
    private readonly cashRecords: CashRecordRepository = cashRecordRepository,
    private readonly receipts: ReceiptRepository = receiptRepository,
    private readonly clinics: ClinicRepository = clinicRepository,
    private readonly users: UserRepository = userRepository,
  ) {}

  async resolve(clinicId: string, patientId: string, category: DocumentCategory, selection: DocumentContextSelection, actorUserId: string): Promise<ResolvedDocumentContext> {
    const [patient, clinic, actor] = await Promise.all([this.patients.findByIdInClinic(patientId, clinicId), this.clinics.findById(clinicId), this.users.findById(actorUserId)]);
    if (!patient) throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    if (!clinic) throw new NotFoundError('Clinic not found', { code: ERROR_CODES.CLINIC_NOT_FOUND });
    if (!actor) throw new NotFoundError('User not found', { code: ERROR_CODES.USER_NOT_FOUND });
    const generatedAt = new Date();
    const locale = 'en-GB';
    const dateFormatter = new Intl.DateTimeFormat(locale, { timeZone: clinic.timezone, dateStyle: 'medium' });
    const dateTimeFormatter = new Intl.DateTimeFormat(locale, { timeZone: clinic.timezone, dateStyle: 'medium', timeStyle: 'short' });
    const doctor = await this.users.findById(clinic.createdBy.toString());

    let guardianSnapshot: GeneratedDocumentContextSnapshot['guardian'] = null;
    if (selection.guardianId) {
      const [guardian, relationship] = await Promise.all([this.guardians.findByIdInClinic(selection.guardianId, clinicId), this.relationships.findByPatientAndGuardian(patientId, selection.guardianId, clinicId)]);
      requireContext(guardian !== null && relationship !== null, 'The selected guardian is not linked to this patient');
      guardianSnapshot = { id: guardian._id.toString(), fullName: fullName(guardian), relationship: relationship.relationship };
    }

    let treatmentSnapshot: GeneratedDocumentContextSnapshot['treatment'] = null;
    let treatmentRecord = null;
    if (selection.treatmentId) {
      treatmentRecord = await this.treatments.findByIdInClinic(selection.treatmentId, clinicId);
      requireContext(treatmentRecord !== null && treatmentRecord.patientId.toString() === patientId, 'The selected treatment does not belong to this patient');
      treatmentSnapshot = { id: treatmentRecord._id.toString(), label: treatmentRecord.customTypeLabel || label(treatmentRecord.type) || 'Treatment', status: treatmentRecord.status, startDate: isoDate(treatmentRecord.startDate), completedAt: treatmentRecord.completedAt?.toISOString() ?? null };
    }
    if (category === DOCUMENT_CATEGORIES.TREATMENT_SUMMARY || category === DOCUMENT_CATEGORIES.RETENTION_SUMMARY) requireContext(Boolean(treatmentRecord), 'Select a treatment for this document');

    let retentionSnapshot: GeneratedDocumentContextSnapshot['retention'] = null;
    let retentionPlan = null;
    if (selection.retentionPlanId) {
      retentionPlan = await this.retention.findPlanById(clinicId, selection.retentionPlanId);
      requireContext(retentionPlan !== null && retentionPlan.patientId.toString() === patientId, 'The selected retention plan does not belong to this patient');
      retentionSnapshot = { id: retentionPlan._id.toString(), status: retentionPlan.status, startedAt: retentionPlan.startedAt?.toISOString() ?? null, nextControlAt: retentionPlan.initialControlRecommendedAt?.toISOString() ?? null };
    }
    if (category === DOCUMENT_CATEGORIES.RETENTION_SUMMARY) requireContext(Boolean(retentionPlan), 'Select a retention plan for this document');

    let appointmentSnapshot: GeneratedDocumentContextSnapshot['appointment'] = null;
    let appointmentRecord = null;
    if (selection.appointmentId) {
      appointmentRecord = await this.appointments.findByIdInClinic(selection.appointmentId, clinicId);
      requireContext(appointmentRecord !== null && appointmentRecord.patientId.toString() === patientId, 'The selected appointment does not belong to this patient');
      const appointmentType = await this.appointmentTypes.findByIdInClinic(appointmentRecord.appointmentTypeId.toString(), clinicId);
      appointmentSnapshot = { id: appointmentRecord._id.toString(), scheduledAt: appointmentRecord.startAt.toISOString(), status: appointmentRecord.status, typeLabel: appointmentType?.name ?? 'Appointment' };
    }
    if (category === DOCUMENT_CATEGORIES.ATTENDANCE_CERTIFICATE) {
      requireContext(appointmentRecord !== null, 'Select an appointment for the attendance certificate');
      const attended: readonly string[] = [APPOINTMENT_STATUSES.ARRIVED, APPOINTMENT_STATUSES.WAITING, APPOINTMENT_STATUSES.IN_TREATMENT, APPOINTMENT_STATUSES.COMPLETED];
      if (!attended.includes(appointmentRecord.status)) throw new BusinessRuleError('Attendance cannot be certified for this appointment status', { code: ERROR_CODES.DOCUMENT_CONTEXT_INVALID });
    }

    let financeSnapshot: GeneratedDocumentContextSnapshot['finance'] = null;
    const tables: Partial<Record<DocumentTableSource, ResolvedDocumentRow[]>> = {};
    if (category === DOCUMENT_CATEGORIES.PAYMENT_STATEMENT) {
      requireContext(Boolean(selection.from && selection.to), 'Select a payment statement date range');
      const from = new Date(`${selection.from}T00:00:00.000Z`);
      const to = new Date(`${selection.to}T23:59:59.999Z`);
      requireContext(Number.isFinite(from.valueOf()) && Number.isFinite(to.valueOf()) && from <= to, 'The payment statement date range is invalid');
      requireContext(to.valueOf() - from.valueOf() <= 366 * 24 * 60 * 60 * 1000, 'Payment statements are limited to 12 months');
      const result = await this.cashRecords.listByClinic(clinicId, { patientId, from, to }, { page: 1, skip: 0, limit: 501 });
      requireContext(result.items.length <= 500, 'Payment statements are limited to 500 records');
      const receiptRecords = await this.receipts.findManyByCashRecordIds(result.items.map((record) => record._id.toString()), clinicId);
      const receiptMap = new Map(receiptRecords.map((receipt) => [receipt.cashRecordId.toString(), receipt.receiptNumber]));
      const totalRecordedMinor = result.items.reduce((total, record) => total + (countsTowardTotal(record.status) ? record.amountMinor : 0), 0);
      financeSnapshot = { from: selection.from!, to: selection.to!, totalRecordedMinor, currency: clinic.currency, recordCount: result.items.length };
      tables[DOCUMENT_TABLE_SOURCES.FINANCE_RECORDS] = result.items.map((record) => ({ cells: [
        { key: 'date', value: dateFormatter.format(record.receivedAt) }, { key: 'receipt', value: receiptMap.get(record._id.toString()) ?? '—' },
        { key: 'method', value: label(record.paymentMethod) ?? record.paymentMethod }, { key: 'amount', value: `${formatMinor(record.amountMinor, record.currency)} ${record.currency}` },
        { key: 'status', value: label(record.status) ?? record.status },
      ] }));
    }

    if (category === DOCUMENT_CATEGORIES.TREATMENT_SUMMARY && treatmentRecord) {
      const milestones = await this.treatments.listMilestonesByTreatment(treatmentRecord._id.toString(), clinicId, { page: 1, skip: 0, limit: 500 });
      const selected = new Set(selection.selectedMilestoneIds ?? []);
      tables[DOCUMENT_TABLE_SOURCES.TREATMENT_MILESTONES] = milestones.items.filter((item) => selected.size === 0 || selected.has(item._id.toString())).map((item) => ({ cells: [{ key: 'date', value: dateFormatter.format(item.occurredAt) }, { key: 'milestone', value: item.title }, { key: 'type', value: label(item.type) ?? item.type }] }));
    }
    if (category === DOCUMENT_CATEGORIES.RETENTION_SUMMARY && retentionPlan) {
      const devices = await this.retention.listDevices(clinicId, retentionPlan._id.toString());
      tables[DOCUMENT_TABLE_SOURCES.RETENTION_DEVICES] = devices.map((device) => ({ cells: [{ key: 'type', value: device.customTypeLabel || label(device.type) || device.type }, { key: 'arch', value: label(device.arch) ?? device.arch }, { key: 'delivered', value: dateFormatter.format(device.deliveredAt) }, { key: 'status', value: label(device.status) ?? device.status }] }));
    }

    const address = [clinic.address.line1, clinic.address.line2, clinic.address.city, clinic.address.postalCode, clinic.address.country].filter(Boolean).join(', ') || null;
    const values: Record<string, string | null> = {
      'patient.fullName': fullName(patient), 'patient.birthDate': patient.birthDate ? dateFormatter.format(patient.birthDate) : null, 'patient.referenceNumber': patient.referenceNumber,
      'clinic.name': clinic.name, 'clinic.address': address, 'clinic.phone': clinic.phone, 'clinic.email': clinic.email, 'doctor.fullName': doctor ? fullName(doctor) : null, 'document.generatedAt': dateTimeFormatter.format(generatedAt),
      'guardian.fullName': guardianSnapshot?.fullName ?? null, 'guardian.relationship': label(guardianSnapshot?.relationship) ?? null,
      'treatment.type': treatmentSnapshot?.label ?? null, 'treatment.status': label(treatmentSnapshot?.status) ?? null, 'treatment.startDate': treatmentRecord?.startDate ? dateFormatter.format(treatmentRecord.startDate) : null, 'treatment.expectedEndDate': treatmentRecord?.expectedEndDate ? dateFormatter.format(treatmentRecord.expectedEndDate) : null, 'treatment.completedAt': treatmentRecord?.completedAt ? dateFormatter.format(treatmentRecord.completedAt) : null,
      'retention.status': label(retentionSnapshot?.status) ?? null, 'retention.startedAt': retentionPlan?.startedAt ? dateFormatter.format(retentionPlan.startedAt) : null, 'retention.nextControlAt': retentionPlan?.initialControlRecommendedAt ? dateFormatter.format(retentionPlan.initialControlRecommendedAt) : null,
      'appointment.date': appointmentRecord ? dateFormatter.format(appointmentRecord.startAt) : null, 'appointment.time': appointmentRecord ? dateTimeFormatter.format(appointmentRecord.startAt) : null, 'appointment.type': appointmentSnapshot?.typeLabel ?? null, 'appointment.status': label(appointmentSnapshot?.status) ?? null,
      'finance.periodStart': financeSnapshot ? dateFormatter.format(new Date(`${financeSnapshot.from}T00:00:00Z`)) : null, 'finance.periodEnd': financeSnapshot ? dateFormatter.format(new Date(`${financeSnapshot.to}T00:00:00Z`)) : null, 'finance.totalRecorded': financeSnapshot ? formatMinor(financeSnapshot.totalRecordedMinor, financeSnapshot.currency) : null, 'finance.currency': financeSnapshot?.currency ?? null, 'finance.recordCount': financeSnapshot ? String(financeSnapshot.recordCount) : null,
      'referral.recipient': selection.referralRecipient ?? null, 'referral.reason': selection.referralReason ?? null, 'referral.message': selection.referralMessage ?? null,
    };
    const snapshot: GeneratedDocumentContextSnapshot = { patient: { id: patient._id.toString(), fullName: fullName(patient), birthDate: isoDate(patient.birthDate), referenceNumber: patient.referenceNumber }, guardian: guardianSnapshot, treatment: treatmentSnapshot, retention: retentionSnapshot, appointment: appointmentSnapshot, finance: financeSnapshot };
    return { snapshot, values, tables, generatedAt, generatedAtLabel: dateTimeFormatter.format(generatedAt), generatedByName: fullName(actor), clinicBranding: { clinicName: clinic.name, address, phone: clinic.phone, email: clinic.email, doctorName: doctor ? fullName(doctor) : null } };
  }
}

export const documentContextService = new DocumentContextService();

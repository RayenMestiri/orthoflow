import { PERMISSIONS, type Permission } from '../../common/constants/permissions.js';
import { escapeRegex } from '../../infrastructure/database/query.helpers.js';
import { AppointmentModel } from '../appointments/appointment.model.js';
import { AppointmentTypeModel } from '../appointment-types/appointment-type.model.js';
import { PatientMediaModel } from '../patient-media/patient-media.model.js';
import { PatientModel } from '../patients/patient.model.js';
import { ReceiptModel } from '../receipts/receipt.model.js';
import { TreatmentModel } from '../treatments/treatment.model.js';
import type {
  GlobalSearchCategory,
  GlobalSearchGroupDto,
  GlobalSearchResponseDto,
  GlobalSearchResultItemDto,
} from './global-search.types.js';

export class GlobalSearchService {
  async search(
    clinicId: string,
    query: string,
    limit: number,
    permissions: readonly Permission[],
  ): Promise<GlobalSearchResponseDto> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return { query: trimmed, totalMatches: 0, groups: [] };
    }

    const canReadPatients = permissions.includes(PERMISSIONS.PATIENT_READ);
    const canReadReceipts =
      permissions.includes(PERMISSIONS.RECEIPT_READ) ||
      permissions.includes(PERMISSIONS.CASH_RECORD_READ);
    const canReadTreatments = permissions.includes(PERMISSIONS.TREATMENT_READ);
    const canReadAppointments = permissions.includes(PERMISSIONS.APPOINTMENT_READ);
    const canReadDocuments = permissions.includes(PERMISSIONS.PATIENT_MEDIA_READ);

    // Parallel bounded query runners
    const [patientItems, receiptItems, treatmentItems, appointmentItems, documentItems] =
      await Promise.all([
        canReadPatients ? this.searchPatients(clinicId, trimmed, limit) : Promise.resolve([]),
        canReadReceipts ? this.searchReceipts(clinicId, trimmed, limit) : Promise.resolve([]),
        canReadTreatments ? this.searchTreatments(clinicId, trimmed, limit) : Promise.resolve([]),
        canReadAppointments ? this.searchAppointments(clinicId, trimmed, limit) : Promise.resolve([]),
        canReadDocuments ? this.searchDocuments(clinicId, trimmed, limit) : Promise.resolve([]),
      ]);

    const groupsMap = new Map<GlobalSearchCategory, GlobalSearchGroupDto>();

    if (patientItems.length > 0) {
      groupsMap.set('PATIENTS', {
        category: 'PATIENTS',
        label: 'Patients',
        items: patientItems,
      });
    }

    if (receiptItems.length > 0) {
      groupsMap.set('RECEIPTS', {
        category: 'RECEIPTS',
        label: 'Reçus & Règlements',
        items: receiptItems,
      });
    }

    if (treatmentItems.length > 0) {
      groupsMap.set('TREATMENTS', {
        category: 'TREATMENTS',
        label: 'Traitements',
        items: treatmentItems,
      });
    }

    if (appointmentItems.length > 0) {
      groupsMap.set('APPOINTMENTS', {
        category: 'APPOINTMENTS',
        label: 'Rendez-vous',
        items: appointmentItems,
      });
    }

    if (documentItems.length > 0) {
      groupsMap.set('DOCUMENTS', {
        category: 'DOCUMENTS',
        label: 'Documents & Radios',
        items: documentItems,
      });
    }

    // Determine deterministic category ranking
    const upperQuery = trimmed.toUpperCase();
    const isReceiptLike = upperQuery.startsWith('REC') || upperQuery.startsWith('RC-');
    const isDigitsOnly = /^\+?\d+$/.test(trimmed.replace(/\s+/g, ''));

    let categoryOrder: GlobalSearchCategory[];
    if (isReceiptLike) {
      categoryOrder = ['RECEIPTS', 'PATIENTS', 'TREATMENTS', 'APPOINTMENTS', 'DOCUMENTS'];
    } else if (isDigitsOnly) {
      categoryOrder = ['PATIENTS', 'RECEIPTS', 'APPOINTMENTS', 'TREATMENTS', 'DOCUMENTS'];
    } else {
      categoryOrder = ['PATIENTS', 'RECEIPTS', 'TREATMENTS', 'APPOINTMENTS', 'DOCUMENTS'];
    }

    const groups: GlobalSearchGroupDto[] = [];
    let totalMatches = 0;

    for (const cat of categoryOrder) {
      const group = groupsMap.get(cat);
      if (group) {
        groups.push(group);
        totalMatches += group.items.length;
      }
    }

    return {
      query: trimmed,
      totalMatches,
      groups,
    };
  }

  // --- Category Search Implementations --------------------------------------

  private async searchPatients(
    clinicId: string,
    query: string,
    limit: number,
  ): Promise<GlobalSearchResultItemDto[]> {
    const escaped = escapeRegex(query);
    const regex = new RegExp(escaped, 'i');

    const digits = query.replace(/\D/g, '');
    const phoneConditions = [];
    if (digits.length >= 2) {
      phoneConditions.push({ phone: { $regex: new RegExp(escapeRegex(digits), 'i') } });
      phoneConditions.push({
        phone: { $regex: new RegExp(digits.split('').join('[\\s.-]?'), 'i') },
      });
    }

    const patients = await PatientModel.find(
      {
        clinicId,
        status: { $ne: 'ARCHIVED' },
        $or: [
          { firstName: regex },
          { lastName: regex },
          { referenceNumber: regex },
          { phone: regex },
          ...phoneConditions,
        ],
      },
      {
        _id: 1,
        firstName: 1,
        lastName: 1,
        referenceNumber: 1,
        birthDate: 1,
        phone: 1,
        status: 1,
      },
    )
      .limit(limit)
      .lean();

    if (patients.length === 0) return [];

    const patientIds = patients.map((p) => p._id);
    const activeTreatments = await TreatmentModel.find(
      { clinicId, patientId: { $in: patientIds }, status: 'ACTIVE' },
      { patientId: 1, type: 1, customTypeLabel: 1, status: 1 },
    ).lean();

    const treatmentMap = new Map<string, string>();
    for (const tr of activeTreatments) {
      const label = tr.customTypeLabel || this.formatTreatmentType(tr.type);
      treatmentMap.set(tr.patientId.toString(), `${label} · En cours`);
    }

    return patients.map((patient) => {
      const id = patient._id.toString();
      const fullName = `${patient.firstName} ${patient.lastName}`.trim();
      const ageStr = patient.birthDate ? `${this.calculateAge(patient.birthDate)} ans` : null;
      const treatmentStr = treatmentMap.get(id) || null;
      const subtitleParts = [ageStr, patient.phone, treatmentStr].filter(Boolean);

      return {
        id,
        type: 'PATIENT',
        title: fullName,
        subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ') : 'Fiche patient',
        badge: patient.referenceNumber || null,
        meta: patient.phone || null,
        patientId: id,
        patientName: fullName,
        targetId: id,
        target: 'PATIENT_PROFILE',
        route: ['/app/patients', id],
        queryParams: null,
      };
    });
  }

  private async searchReceipts(
    clinicId: string,
    query: string,
    limit: number,
  ): Promise<GlobalSearchResultItemDto[]> {
    const escaped = escapeRegex(query);
    const regex = new RegExp(escaped, 'i');

    const receipts = await ReceiptModel.find(
      {
        clinicId,
        $or: [{ receiptNumber: regex }],
      },
      {
        _id: 1,
        receiptNumber: 1,
        patientId: 1,
        amountMinor: 1,
        currency: 1,
        issuedAt: 1,
        status: 1,
      },
    )
      .sort({ issuedAt: -1 })
      .limit(limit)
      .lean();

    if (receipts.length === 0) return [];

    const patientIds = [...new Set(receipts.map((r) => r.patientId.toString()))];
    const patients = await PatientModel.find(
      { clinicId, _id: { $in: patientIds } },
      { _id: 1, firstName: 1, lastName: 1 },
    ).lean();

    const patientNameMap = new Map<string, string>();
    for (const p of patients) {
      patientNameMap.set(p._id.toString(), `${p.firstName} ${p.lastName}`.trim());
    }

    return receipts.map((receipt) => {
      const id = receipt._id.toString();
      const patientIdStr = receipt.patientId.toString();
      const patientName = patientNameMap.get(patientIdStr) || 'Patient';
      const formattedAmount = `${(receipt.amountMinor / 1000).toFixed(3)} ${receipt.currency}`;
      const dateStr = new Date(receipt.issuedAt).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      return {
        id,
        type: 'RECEIPT',
        title: receipt.receiptNumber,
        subtitle: `${formattedAmount} · ${patientName}`,
        badge: receipt.status === 'CANCELLED' ? 'Annulé' : 'Émis',
        meta: `Enregistré le ${dateStr}`,
        patientId: patientIdStr,
        patientName,
        targetId: id,
        target: 'RECEIPT_DETAIL',
        route: ['/app/patients', patientIdStr],
        queryParams: {
          tab: 'payments',
          receiptNumber: receipt.receiptNumber,
          receiptId: id,
          openReceipt: 'true',
        },
      };
    });
  }

  private async searchTreatments(
    clinicId: string,
    query: string,
    limit: number,
  ): Promise<GlobalSearchResultItemDto[]> {
    const escaped = escapeRegex(query);
    const regex = new RegExp(escaped, 'i');

    const treatments = await TreatmentModel.find(
      {
        clinicId,
        $or: [{ type: regex }, { customTypeLabel: regex }],
      },
      {
        _id: 1,
        patientId: 1,
        type: 1,
        customTypeLabel: 1,
        status: 1,
        startDate: 1,
      },
    )
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    if (treatments.length === 0) return [];

    const patientIds = [...new Set(treatments.map((t) => t.patientId.toString()))];
    const patients = await PatientModel.find(
      { clinicId, _id: { $in: patientIds } },
      { _id: 1, firstName: 1, lastName: 1 },
    ).lean();

    const patientNameMap = new Map<string, string>();
    for (const p of patients) {
      patientNameMap.set(p._id.toString(), `${p.firstName} ${p.lastName}`.trim());
    }

    return treatments.map((treatment) => {
      const id = treatment._id.toString();
      const patientIdStr = treatment.patientId.toString();
      const patientName = patientNameMap.get(patientIdStr) || 'Patient';
      const label = treatment.customTypeLabel || this.formatTreatmentType(treatment.type);

      return {
        id,
        type: 'TREATMENT',
        title: label,
        subtitle: `${patientName} · ${this.formatTreatmentStatus(treatment.status)}`,
        badge: this.formatTreatmentStatus(treatment.status),
        meta: treatment.startDate
          ? `Début le ${new Date(treatment.startDate).toLocaleDateString('fr-FR')}`
          : null,
        patientId: patientIdStr,
        patientName,
        targetId: id,
        target: 'TREATMENT_DETAIL',
        route: ['/app/patients', patientIdStr],
        queryParams: { tab: 'treatments', treatmentId: id },
      };
    });
  }

  private async searchAppointments(
    clinicId: string,
    query: string,
    limit: number,
  ): Promise<GlobalSearchResultItemDto[]> {
    const escaped = escapeRegex(query);
    const regex = new RegExp(escaped, 'i');

    // 1. Find matching patients by name
    const matchingPatients = await PatientModel.find(
      {
        clinicId,
        $or: [{ firstName: regex }, { lastName: regex }],
      },
      { _id: 1, firstName: 1, lastName: 1 },
    )
      .limit(limit * 2)
      .lean();

    const matchingPatientIds = matchingPatients.map((p) => p._id);

    // 2. Find matching appointment types by name
    const matchingTypes = await AppointmentTypeModel.find(
      {
        clinicId,
        name: regex,
      },
      { _id: 1, name: 1 },
    ).lean();

    const matchingTypeIds = matchingTypes.map((t) => t._id);

    // If neither matched, we can't find appointments by patient name or type
    if (matchingPatientIds.length === 0 && matchingTypeIds.length === 0) {
      return [];
    }

    const appointments = await AppointmentModel.find(
      {
        clinicId,
        status: { $ne: 'CANCELLED' },
        $or: [
          ...(matchingPatientIds.length > 0 ? [{ patientId: { $in: matchingPatientIds } }] : []),
          ...(matchingTypeIds.length > 0 ? [{ appointmentTypeId: { $in: matchingTypeIds } }] : []),
        ],
      },
      {
        _id: 1,
        patientId: 1,
        appointmentTypeId: 1,
        startAt: 1,
        status: 1,
      },
    )
      .sort({ startAt: -1 })
      .limit(limit)
      .lean();

    if (appointments.length === 0) return [];

    // Resolve patient names & type names
    const allPatientIds = [...new Set(appointments.map((a) => a.patientId.toString()))];
    const allTypeIds = [...new Set(appointments.map((a) => a.appointmentTypeId.toString()))];

    const [patients, types] = await Promise.all([
      PatientModel.find(
        { clinicId, _id: { $in: allPatientIds } },
        { _id: 1, firstName: 1, lastName: 1 },
      ).lean(),
      AppointmentTypeModel.find({ clinicId, _id: { $in: allTypeIds } }, { _id: 1, name: 1 }).lean(),
    ]);

    const patientNameMap = new Map<string, string>();
    for (const p of patients) {
      patientNameMap.set(p._id.toString(), `${p.firstName} ${p.lastName}`.trim());
    }

    const typeNameMap = new Map<string, string>();
    for (const t of types) {
      typeNameMap.set(t._id.toString(), t.name);
    }

    return appointments.map((appt) => {
      const id = appt._id.toString();
      const patientIdStr = appt.patientId.toString();
      const patientName = patientNameMap.get(patientIdStr) || 'Patient';
      const typeName = typeNameMap.get(appt.appointmentTypeId.toString()) || 'Rendez-vous';
      const dateStr = new Date(appt.startAt).toLocaleString('fr-FR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });

      return {
        id,
        type: 'APPOINTMENT',
        title: patientName,
        subtitle: `${typeName} · ${dateStr}`,
        badge: this.formatAppointmentStatus(appt.status),
        meta: dateStr,
        patientId: patientIdStr,
        patientName,
        targetId: id,
        target: 'APPOINTMENT_DETAIL',
        route: ['/app/appointments'],
        queryParams: { appointmentId: id, patientId: patientIdStr },
      };
    });
  }

  private async searchDocuments(
    clinicId: string,
    query: string,
    limit: number,
  ): Promise<GlobalSearchResultItemDto[]> {
    const escaped = escapeRegex(query);
    const regex = new RegExp(escaped, 'i');

    const mediaItems = await PatientMediaModel.find(
      {
        clinicId,
        status: 'ACTIVE',
        $or: [{ title: regex }, { originalFileName: regex }, { category: regex }],
      },
      {
        _id: 1,
        patientId: 1,
        title: 1,
        category: 1,
        uploadedAt: 1,
        mediaType: 1,
      },
    )
      .sort({ uploadedAt: -1 })
      .limit(limit)
      .lean();

    if (mediaItems.length === 0) return [];

    const patientIds = [...new Set(mediaItems.map((m) => m.patientId.toString()))];
    const patients = await PatientModel.find(
      { clinicId, _id: { $in: patientIds } },
      { _id: 1, firstName: 1, lastName: 1 },
    ).lean();

    const patientNameMap = new Map<string, string>();
    for (const p of patients) {
      patientNameMap.set(p._id.toString(), `${p.firstName} ${p.lastName}`.trim());
    }

    return mediaItems.map((media) => {
      const id = media._id.toString();
      const patientIdStr = media.patientId.toString();
      const patientName = patientNameMap.get(patientIdStr) || 'Patient';
      const dateStr = new Date(media.uploadedAt).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      return {
        id,
        type: 'DOCUMENT',
        title: media.title,
        subtitle: `${patientName} · ${dateStr}`,
        badge: this.formatMediaCategory(media.category),
        meta: dateStr,
        patientId: patientIdStr,
        patientName,
        targetId: id,
        target: 'DOCUMENT_VIEWER',
        route: ['/app/patients', patientIdStr],
        queryParams: { tab: 'media', documentId: id },
      };
    });
  }

  // --- Helper Formatting ---------------------------------------------------

  private calculateAge(birthDate: Date): number {
    const now = new Date();
    const birth = new Date(birthDate);
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    return Math.max(0, age);
  }

  private formatTreatmentType(type: string): string {
    const map: Record<string, string> = {
      METAL_BRACES: 'Bagues métalliques',
      CERAMIC_BRACES: 'Bagues céramiques',
      CLEAR_ALIGNERS: 'Gouttières invisibles',
      LINGUAL_BRACES: 'Bagues linguales',
      RETAINER: 'Appareil de contention',
      EXPANDER: 'Disjoncteur palatin',
      OTHER: 'Autre traitement',
    };
    return map[type] || type.toLowerCase().replaceAll('_', ' ');
  }

  private formatTreatmentStatus(status: string): string {
    const map: Record<string, string> = {
      PLANNED: 'Planifié',
      ACTIVE: 'En cours',
      PAUSED: 'En pause',
      COMPLETED: 'Terminé',
      CANCELLED: 'Annulé',
    };
    return map[status] || status;
  }

  private formatAppointmentStatus(status: string): string {
    const map: Record<string, string> = {
      SCHEDULED: 'Programmé',
      ARRIVED: 'Arrivé',
      IN_CHAIR: 'Au fauteuil',
      COMPLETED: 'Terminé',
      NO_SHOW: 'Absent',
      CANCELLED: 'Annulé',
    };
    return map[status] || status;
  }

  private formatMediaCategory(category: string): string {
    const map: Record<string, string> = {
      EXTRAORAL_PHOTO: 'Photo extra-orale',
      INTRAORAL_PHOTO: 'Photo intra-orale',
      PANORAMIC_XRAY: 'Panoramique',
      CEPHALOMETRIC_XRAY: 'Téléradiographie',
      PERIAPICAL_XRAY: 'Rétro-alvéolaire',
      TREATMENT_PLAN: 'Plan de traitement',
      CONSENT_FORM: 'Consentement',
      CORRESPONDENCE: 'Courrier',
      OTHER_DOCUMENT: 'Document',
      ADMINISTRATIVE: 'Administratif',
    };
    return map[category] || category;
  }
}

export const globalSearchService = new GlobalSearchService();

import { toObjectId } from '../../common/utils/object-id.js';
import { AppointmentTypeModel } from '../appointment-types/appointment-type.model.js';
import { AuditLogModel } from '../audit-logs/audit-log.model.js';
import { AUDIT_ACTIONS } from '../audit-logs/audit-log.types.js';
import { ClinicMembershipModel } from '../memberships/membership.model.js';
import { PatientGuardianModel } from '../guardians/patient-guardian.model.js';
import { PatientModel } from '../patients/patient.model.js';
import { UserModel } from '../users/user.model.js';

export interface RawRecentActivityLog {
  _id: string;
  action: string;
  actorUserId: string | null;
  actorName: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
  patientId?: string;
  patientName?: string;
}

export class DashboardRepository {
  async countMinorsWithoutPrimaryGuardian(clinicId: string): Promise<number> {
    const clinicObjectId = toObjectId(clinicId, 'clinicId');
    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);

    const minors = await PatientModel.find({
      clinicId: clinicObjectId,
      status: 'ACTIVE',
      birthDate: { $gt: eighteenYearsAgo },
    })
      .select('_id')
      .lean();

    if (!minors || minors.length === 0) return 0;

    const minorIds = minors.map((m) => m._id);
    const linksWithPrimary = await PatientGuardianModel.distinct('patientId', {
      clinicId: clinicObjectId,
      patientId: { $in: minorIds },
      isPrimary: true,
    });

    return Math.max(0, minorIds.length - (linksWithPrimary?.length ?? 0));
  }

  async getRecentActivityLogs(clinicId: string, limit = 8): Promise<RawRecentActivityLog[]> {
    const clinicObjectId = toObjectId(clinicId, 'clinicId');
    const allowedActions = [
      AUDIT_ACTIONS.CASH_RECORD_CREATED,
      AUDIT_ACTIONS.CASH_RECORD_CANCELLED,
      AUDIT_ACTIONS.CLINICAL_VISIT_COMPLETED,
      AUDIT_ACTIONS.APPOINTMENT_CREATED,
      AUDIT_ACTIONS.APPOINTMENT_RESCHEDULED,
      AUDIT_ACTIONS.APPOINTMENT_CANCELLED,
      AUDIT_ACTIONS.PATIENT_CREATED,
      AUDIT_ACTIONS.PATIENT_MEDIA_UPLOADED,
    ];

    const logs = await AuditLogModel.find({
      clinicId: clinicObjectId,
      action: { $in: allowedActions },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    if (!logs || logs.length === 0) return [];

    const actorIds = [...new Set(logs.map((l) => l.actorUserId).filter(Boolean))];
    const patientIds = [
      ...new Set(
        logs
          .map((l) => l.metadata?.patientId)
          .filter(Boolean)
          .map((id) => toObjectId(String(id), 'patientId')),
      ),
    ];

    const [users, patients] = await Promise.all([
      actorIds.length > 0
        ? UserModel.find({ _id: { $in: actorIds } })
            .select('_id firstName lastName')
            .lean()
        : Promise.resolve([]),
      patientIds.length > 0
        ? PatientModel.find({ _id: { $in: patientIds } })
            .select('_id firstName lastName')
            .lean()
        : Promise.resolve([]),
    ]);

    const userMap = new Map(
      (users ?? []).map((u) => [String(u._id), `${u.firstName} ${u.lastName}`.trim()]),
    );
    const patientMap = new Map(
      (patients ?? []).map((p) => [String(p._id), `${p.firstName} ${p.lastName}`.trim()]),
    );

    return logs.map((log) => {
      const actorUserId = log.actorUserId ? String(log.actorUserId) : null;
      const actorName = actorUserId ? (userMap.get(actorUserId) ?? 'Membre du cabinet') : 'Système';
      const rawPatientId = log.metadata?.patientId;
      const patientId = typeof rawPatientId === 'string' ? rawPatientId : undefined;
      const patientName = patientId ? patientMap.get(patientId) : undefined;

      return {
        _id: String(log._id),
        action: log.action,
        actorUserId,
        actorName,
        createdAt: log.createdAt,
        metadata: log.metadata,
        patientId,
        patientName,
      };
    });
  }

  async getClinicSetupCounts(
    clinicId: string,
  ): Promise<{ appointmentTypesCount: number; membersCount: number }> {
    const clinicObjectId = toObjectId(clinicId, 'clinicId');
    const [appointmentTypesCount, membersCount] = await Promise.all([
      AppointmentTypeModel.countDocuments({ clinicId: clinicObjectId, isActive: true }),
      ClinicMembershipModel.countDocuments({ clinicId: clinicObjectId, status: 'ACTIVE' }),
    ]);

    return {
      appointmentTypesCount: appointmentTypesCount ?? 0,
      membersCount: membersCount ?? 0,
    };
  }
}

export const dashboardRepository = new DashboardRepository();

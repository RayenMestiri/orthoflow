import type { ClientSession, QueryFilter } from 'mongoose';
import { toObjectId } from '../../common/utils/object-id.js';
import { PatientGuardianModel } from './patient-guardian.model.js';
import type {
  ContactPreference,
  GuardianRelationship,
  PatientGuardianAttributes,
  PatientGuardianRecord,
} from './guardian.types.js';

interface CreatePatientGuardianInput {
  clinicId: string;
  patientId: string;
  guardianId: string;
  createdBy: string;
  relationship: GuardianRelationship;
  isPrimary: boolean;
  financiallyResponsible: boolean;
  contactPreference: ContactPreference;
}

interface UpdatePatientGuardianInput {
  relationship?: GuardianRelationship;
  isPrimary?: boolean;
  financiallyResponsible?: boolean;
  contactPreference?: ContactPreference;
}

export class PatientGuardianRepository {
  private baseFilter(clinicId: string): QueryFilter<PatientGuardianAttributes> {
    return { clinicId: toObjectId(clinicId, 'clinicId') };
  }

  async listByPatient(patientId: string, clinicId: string): Promise<PatientGuardianRecord[]> {
    return PatientGuardianModel.find({
      ...this.baseFilter(clinicId),
      patientId: toObjectId(patientId, 'patientId'),
    })
      .sort({ isPrimary: -1, createdAt: 1 })
      .lean<PatientGuardianRecord[]>()
      .exec();
  }

  async listPrimaryByPatientIds(
    patientIds: string[],
    clinicId: string,
  ): Promise<PatientGuardianRecord[]> {
    if (patientIds.length === 0) return [];
    return PatientGuardianModel.find({
      ...this.baseFilter(clinicId),
      patientId: { $in: patientIds.map((id) => toObjectId(id, 'patientId')) },
      isPrimary: true,
    })
      .limit(patientIds.length)
      .lean<PatientGuardianRecord[]>()
      .exec();
  }

  async findByPatientAndGuardian(
    patientId: string,
    guardianId: string,
    clinicId: string,
  ): Promise<PatientGuardianRecord | null> {
    return PatientGuardianModel.findOne({
      ...this.baseFilter(clinicId),
      patientId: toObjectId(patientId, 'patientId'),
      guardianId: toObjectId(guardianId, 'guardianId'),
    })
      .lean<PatientGuardianRecord | null>()
      .exec();
  }

  async create(
    input: CreatePatientGuardianInput,
    session?: ClientSession,
  ): Promise<PatientGuardianRecord> {
    const [created] = await PatientGuardianModel.create(
      [
        {
          clinicId: toObjectId(input.clinicId, 'clinicId'),
          patientId: toObjectId(input.patientId, 'patientId'),
          guardianId: toObjectId(input.guardianId, 'guardianId'),
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          relationship: input.relationship,
          isPrimary: input.isPrimary,
          financiallyResponsible: input.financiallyResponsible,
          contactPreference: input.contactPreference,
        },
      ],
      { session, ordered: true },
    );
    if (!created) throw new Error('Patient guardian relationship creation returned no document');
    return created.toObject<PatientGuardianRecord>();
  }

  async clearPrimary(patientId: string, clinicId: string, session?: ClientSession): Promise<void> {
    const query = PatientGuardianModel.updateMany(
      {
        ...this.baseFilter(clinicId),
        patientId: toObjectId(patientId, 'patientId'),
        isPrimary: true,
      },
      { $set: { isPrimary: false } },
    );
    if (session) query.session(session);
    await query.exec();
  }

  async update(
    patientId: string,
    guardianId: string,
    clinicId: string,
    changes: UpdatePatientGuardianInput,
    session?: ClientSession,
  ): Promise<PatientGuardianRecord | null> {
    const query = PatientGuardianModel.findOneAndUpdate(
      {
        ...this.baseFilter(clinicId),
        patientId: toObjectId(patientId, 'patientId'),
        guardianId: toObjectId(guardianId, 'guardianId'),
      },
      { $set: changes },
      { new: true, runValidators: true },
    );
    if (session) query.session(session);
    return query.lean<PatientGuardianRecord | null>().exec();
  }
}

export const patientGuardianRepository = new PatientGuardianRepository();

import type { ClientSession, QueryFilter } from 'mongoose';
import { toObjectId } from '../../common/utils/object-id.js';
import { RetainerDeviceModel, RetentionPlanModel } from './retention.model.js';
import {
  RETAINER_STATUSES,
  type RetainerDeviceInput,
  type RetainerDeviceRecord,
  type RetainerStatus,
  type RetentionPlanAttributes,
  type RetentionPlanRecord,
  type RetentionStatus,
} from './retention.types.js';

export class RetentionRepository {
  private planFilter(clinicId: string): QueryFilter<RetentionPlanAttributes> {
    return { clinicId: toObjectId(clinicId, 'clinicId') };
  }

  async findPlanById(
    clinicId: string,
    retentionPlanId: string,
    session?: ClientSession,
  ): Promise<RetentionPlanRecord | null> {
    return RetentionPlanModel.findOne({
      ...this.planFilter(clinicId),
      _id: toObjectId(retentionPlanId, 'retentionPlanId'),
    })
      .session(session ?? null)
      .lean<RetentionPlanRecord | null>()
      .exec();
  }

  async findPlanByTreatment(
    clinicId: string,
    treatmentId: string,
  ): Promise<RetentionPlanRecord | null> {
    return RetentionPlanModel.findOne({
      ...this.planFilter(clinicId),
      treatmentId: toObjectId(treatmentId, 'treatmentId'),
    })
      .lean<RetentionPlanRecord | null>()
      .exec();
  }

  async listPlansForPatient(clinicId: string, patientId: string): Promise<RetentionPlanRecord[]> {
    return RetentionPlanModel.find({
      ...this.planFilter(clinicId),
      patientId: toObjectId(patientId, 'patientId'),
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean<RetentionPlanRecord[]>()
      .exec();
  }

  async createPlan(
    input: {
      clinicId: string;
      patientId: string;
      treatmentId: string;
      status: RetentionStatus;
      initialControlRecommendedAt: Date | null;
      startedAt: Date | null;
      notes: string | null;
      createdBy: string;
    },
    session?: ClientSession,
  ): Promise<RetentionPlanRecord> {
    const [created] = await RetentionPlanModel.create(
      [
        {
          clinicId: toObjectId(input.clinicId, 'clinicId'),
          patientId: toObjectId(input.patientId, 'patientId'),
          treatmentId: toObjectId(input.treatmentId, 'treatmentId'),
          status: input.status,
          initialControlRecommendedAt: input.initialControlRecommendedAt,
          startedAt: input.startedAt,
          completedAt: null,
          cancelledAt: null,
          cancellationReason: null,
          completionReason: null,
          notes: input.notes,
          createdBy: toObjectId(input.createdBy, 'createdBy'),
          updatedBy: null,
        },
      ],
      session ? { session } : {},
    );
    if (!created) throw new Error('Retention plan creation returned no document');
    return created.toObject<RetentionPlanRecord>();
  }

  async updatePlan(
    clinicId: string,
    retentionPlanId: string,
    changes: Partial<{
      status: RetentionStatus;
      initialControlRecommendedAt: Date | null;
      startedAt: Date | null;
      completedAt: Date | null;
      cancelledAt: Date | null;
      cancellationReason: string | null;
      completionReason: string | null;
      notes: string | null;
    }>,
    updatedBy: string,
    expectedStatus?: RetentionStatus,
    session?: ClientSession,
  ): Promise<RetentionPlanRecord | null> {
    return RetentionPlanModel.findOneAndUpdate(
      {
        ...this.planFilter(clinicId),
        _id: toObjectId(retentionPlanId, 'retentionPlanId'),
        ...(expectedStatus ? { status: expectedStatus } : {}),
      },
      { $set: { ...changes, updatedBy: toObjectId(updatedBy, 'updatedBy') } },
      { new: true, runValidators: true, session },
    )
      .lean<RetentionPlanRecord | null>()
      .exec();
  }

  async listDevices(clinicId: string, retentionPlanId: string): Promise<RetainerDeviceRecord[]> {
    return RetainerDeviceModel.find({
      clinicId: toObjectId(clinicId, 'clinicId'),
      retentionPlanId: toObjectId(retentionPlanId, 'retentionPlanId'),
    })
      .sort({ deliveredAt: -1, createdAt: -1 })
      .limit(100)
      .lean<RetainerDeviceRecord[]>()
      .exec();
  }

  async listDevicesForPlans(
    clinicId: string,
    retentionPlanIds: string[],
  ): Promise<RetainerDeviceRecord[]> {
    if (retentionPlanIds.length === 0) return [];
    return RetainerDeviceModel.find({
      clinicId: toObjectId(clinicId, 'clinicId'),
      retentionPlanId: { $in: retentionPlanIds.map((id) => toObjectId(id, 'retentionPlanId')) },
    })
      .sort({ deliveredAt: -1, createdAt: -1 })
      .limit(Math.min(retentionPlanIds.length * 100, 1000))
      .lean<RetainerDeviceRecord[]>()
      .exec();
  }

  async findDevice(
    clinicId: string,
    retentionPlanId: string,
    retainerId: string,
    session?: ClientSession,
  ): Promise<RetainerDeviceRecord | null> {
    return RetainerDeviceModel.findOne({
      clinicId: toObjectId(clinicId, 'clinicId'),
      retentionPlanId: toObjectId(retentionPlanId, 'retentionPlanId'),
      _id: toObjectId(retainerId, 'retainerId'),
    })
      .session(session ?? null)
      .lean<RetainerDeviceRecord | null>()
      .exec();
  }

  async createDevice(
    plan: RetentionPlanRecord,
    input: RetainerDeviceInput,
    actorUserId: string,
    replacesRetainerId: string | null = null,
    session?: ClientSession,
  ): Promise<RetainerDeviceRecord> {
    const [created] = await RetainerDeviceModel.create(
      [
        {
          clinicId: plan.clinicId,
          patientId: plan.patientId,
          treatmentId: plan.treatmentId,
          retentionPlanId: plan._id,
          type: input.type,
          customTypeLabel: input.customTypeLabel ?? null,
          arch: input.arch,
          status: RETAINER_STATUSES.ACTIVE,
          deliveredAt: input.deliveredAt ?? new Date(),
          endedAt: null,
          replacesRetainerId: replacesRetainerId
            ? toObjectId(replacesRetainerId, 'replacesRetainerId')
            : null,
          notes: input.notes ?? null,
          createdBy: toObjectId(actorUserId, 'createdBy'),
          updatedBy: null,
        },
      ],
      session ? { session } : {},
    );
    if (!created) throw new Error('Retainer device creation returned no document');
    return created.toObject<RetainerDeviceRecord>();
  }

  async transitionDevice(
    clinicId: string,
    retentionPlanId: string,
    retainerId: string,
    target: Exclude<RetainerStatus, 'ACTIVE'>,
    actorUserId: string,
    session?: ClientSession,
  ): Promise<RetainerDeviceRecord | null> {
    return RetainerDeviceModel.findOneAndUpdate(
      {
        clinicId: toObjectId(clinicId, 'clinicId'),
        retentionPlanId: toObjectId(retentionPlanId, 'retentionPlanId'),
        _id: toObjectId(retainerId, 'retainerId'),
        status: RETAINER_STATUSES.ACTIVE,
      },
      {
        $set: {
          status: target,
          endedAt: new Date(),
          updatedBy: toObjectId(actorUserId, 'updatedBy'),
        },
      },
      { new: true, runValidators: true, session },
    )
      .lean<RetainerDeviceRecord | null>()
      .exec();
  }
}

export const retentionRepository = new RetentionRepository();

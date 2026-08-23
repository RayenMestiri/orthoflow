import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import type { ClientSession } from 'mongoose';
import type { TenantContext } from '../../common/types/auth.types.js';
import type { MutationContext } from '../../common/utils/request-context.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES, type AuditAction } from '../audit-logs/audit-log.types.js';
import { patientRepository, type PatientRepository } from '../patients/patient.repository.js';
import { treatmentRepository, type TreatmentRepository } from '../treatments/treatment.repository.js';
import { TREATMENT_STATUSES } from '../treatments/treatment.types.js';
import { toRetentionPlanDto } from './retention.mapper.js';
import { retentionRepository, type RetentionRepository } from './retention.repository.js';
import {
  RETAINER_STATUSES,
  RETAINER_TYPES,
  RETENTION_STATUSES,
  type RetainerDeviceInput,
  type RetainerDeviceRecord,
  type RetentionPlanDto,
  type RetentionPlanRecord,
} from './retention.types.js';

function duplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export class RetentionService {
  constructor(
    private readonly retention: RetentionRepository = retentionRepository,
    private readonly treatments: TreatmentRepository = treatmentRepository,
    private readonly patients: PatientRepository = patientRepository,
    private readonly audit: AuditLogService = auditLogService,
  ) {}

  async listForPatient(
    tenant: TenantContext,
    patientId: string,
    includePrivate: boolean,
  ): Promise<RetentionPlanDto[]> {
    if (!(await this.patients.findByIdInClinic(patientId, tenant.clinicId))) {
      throw new NotFoundError('Patient not found');
    }
    const plans = await this.retention.listPlansForPatient(tenant.clinicId, patientId);
    const devices = await this.retention.listDevicesForPlans(
      tenant.clinicId,
      plans.map((plan) => plan._id.toString()),
    );
    return plans.map((plan) =>
      toRetentionPlanDto(
        plan,
        devices.filter((device) => device.retentionPlanId.equals(plan._id)),
        includePrivate,
      ),
    );
  }

  async getByTreatment(
    tenant: TenantContext,
    treatmentId: string,
    includePrivate: boolean,
  ): Promise<RetentionPlanDto | null> {
    const treatment = await this.treatments.findByIdInClinic(treatmentId, tenant.clinicId);
    if (!treatment) throw new NotFoundError('Treatment not found');
    const plan = await this.retention.findPlanByTreatment(tenant.clinicId, treatmentId);
    if (!plan) return null;
    return this.hydrate(plan, includePrivate);
  }

  async create(
    tenant: TenantContext,
    treatmentId: string,
    input: {
      initialControlRecommendedAt?: Date | null;
      notes?: string | null;
      retainers?: RetainerDeviceInput[];
    },
    context: MutationContext,
  ): Promise<RetentionPlanDto> {
    const treatment = await this.treatments.findByIdInClinic(treatmentId, tenant.clinicId);
    if (!treatment) throw new NotFoundError('Treatment not found');
    if (treatment.status !== TREATMENT_STATUSES.COMPLETED) {
      throw new BusinessRuleError('Retention can only be created for a completed treatment');
    }
    const devices = input.retainers ?? [];
    devices.forEach((device) => this.assertDevice(device));
    const now = new Date();
    let createdPlan: RetentionPlanRecord;
    let createdDevices: RetainerDeviceRecord[];
    try {
      ({ plan: createdPlan, devices: createdDevices } = await withTransaction(async (session) => {
        const plan = await this.retention.createPlan(
          {
            clinicId: tenant.clinicId,
            patientId: treatment.patientId.toString(),
            treatmentId,
            status: devices.length > 0 ? RETENTION_STATUSES.ACTIVE : RETENTION_STATUSES.PLANNED,
            initialControlRecommendedAt: input.initialControlRecommendedAt ?? null,
            startedAt: devices.length > 0 ? now : null,
            notes: input.notes ?? null,
            createdBy: context.actorUserId,
          },
          session,
        );
        const inserted: RetainerDeviceRecord[] = [];
        for (const device of devices) {
          inserted.push(
            await this.retention.createDevice(plan, device, context.actorUserId, null, session),
          );
        }
        return { plan, devices: inserted };
      }));
    } catch (error) {
      if (duplicateKey(error)) {
        throw new ConflictError('This treatment already has a retention plan');
      }
      throw error;
    }
    await this.treatments.markRetentionRequired(treatmentId, tenant.clinicId, context.actorUserId);
    await this.record(
      tenant.clinicId,
      treatment.patientId.toString(),
      createdPlan,
      AUDIT_ACTIONS.RETENTION_CREATED,
      { status: createdPlan.status, retainerCount: createdDevices.length },
      context,
    );
    for (const device of createdDevices) {
      await this.recordDevice(createdPlan, device, AUDIT_ACTIONS.RETAINER_DELIVERED, {}, context);
    }
    return toRetentionPlanDto(createdPlan, createdDevices, true);
  }

  async update(
    tenant: TenantContext,
    retentionPlanId: string,
    input: { initialControlRecommendedAt?: Date | null; notes?: string | null },
    context: MutationContext,
  ): Promise<RetentionPlanDto> {
    const plan = await this.requirePlan(tenant.clinicId, retentionPlanId);
    this.assertOpen(plan);
    const updated = await this.retention.updatePlan(
      tenant.clinicId,
      retentionPlanId,
      input,
      context.actorUserId,
    );
    if (!updated) throw new NotFoundError('Retention plan not found');
    await this.record(
      tenant.clinicId,
      plan.patientId.toString(),
      updated,
      AUDIT_ACTIONS.RETENTION_UPDATED,
      { fields: Object.keys(input) },
      context,
    );
    return this.hydrate(updated, true);
  }

  async deliver(
    tenant: TenantContext,
    retentionPlanId: string,
    input: RetainerDeviceInput,
    context: MutationContext,
  ): Promise<RetentionPlanDto> {
    this.assertDevice(input);
    const { plan, device, activated } = await withTransaction(async (session) => {
      const existing = await this.requirePlan(tenant.clinicId, retentionPlanId, session);
      this.assertOpen(existing);
      const device = await this.retention.createDevice(
        existing,
        input,
        context.actorUserId,
        null,
        session,
      );
      const plan =
        existing.status === RETENTION_STATUSES.PLANNED
          ? await this.retention.updatePlan(
              tenant.clinicId,
              retentionPlanId,
              { status: RETENTION_STATUSES.ACTIVE, startedAt: new Date() },
              context.actorUserId,
              RETENTION_STATUSES.PLANNED,
              session,
            )
          : existing;
      if (!plan) throw new ConflictError('Retention plan changed; reload and retry');
      return { plan, device, activated: existing.status === RETENTION_STATUSES.PLANNED };
    });
    await this.recordDevice(plan, device, AUDIT_ACTIONS.RETAINER_DELIVERED, {}, context);
    if (activated) {
      await this.record(
        tenant.clinicId,
        plan.patientId.toString(),
        plan,
        AUDIT_ACTIONS.RETENTION_ACTIVATED,
        {},
        context,
      );
    }
    return this.hydrate(plan, true);
  }

  async replace(
    tenant: TenantContext,
    retentionPlanId: string,
    retainerId: string,
    input: RetainerDeviceInput,
    context: MutationContext,
  ): Promise<RetentionPlanDto> {
    this.assertDevice(input);
    const { plan, oldDevice, newDevice } = await withTransaction(async (session) => {
      const plan = await this.requirePlan(tenant.clinicId, retentionPlanId, session);
      this.assertOpen(plan);
      const existing = await this.retention.findDevice(
        tenant.clinicId,
        retentionPlanId,
        retainerId,
        session,
      );
      if (!existing) throw new NotFoundError('Retainer not found');
      if (existing.status !== RETAINER_STATUSES.ACTIVE) {
        throw new BusinessRuleError('Only an active retainer can be replaced');
      }
      const oldDevice = await this.retention.transitionDevice(
        tenant.clinicId,
        retentionPlanId,
        retainerId,
        RETAINER_STATUSES.REPLACED,
        context.actorUserId,
        session,
      );
      if (!oldDevice) throw new ConflictError('Retainer changed; reload and retry');
      const newDevice = await this.retention.createDevice(
        plan,
        input,
        context.actorUserId,
        retainerId,
        session,
      );
      return { plan, oldDevice, newDevice };
    });
    await this.recordDevice(
      plan,
      oldDevice,
      AUDIT_ACTIONS.RETAINER_REPLACED,
      { replacementRetainerId: newDevice._id.toString() },
      context,
    );
    await this.recordDevice(
      plan,
      newDevice,
      AUDIT_ACTIONS.RETAINER_DELIVERED,
      { replacesRetainerId: oldDevice._id.toString() },
      context,
    );
    return this.hydrate(plan, true);
  }

  async markDevice(
    tenant: TenantContext,
    retentionPlanId: string,
    retainerId: string,
    target: 'LOST' | 'DISCONTINUED',
    context: MutationContext,
  ): Promise<RetentionPlanDto> {
    const plan = await this.requirePlan(tenant.clinicId, retentionPlanId);
    this.assertOpen(plan);
    const updated = await this.retention.transitionDevice(
      tenant.clinicId,
      retentionPlanId,
      retainerId,
      target,
      context.actorUserId,
    );
    if (!updated) throw new BusinessRuleError('Only an active retainer can be changed');
    await this.recordDevice(
      plan,
      updated,
      target === RETAINER_STATUSES.LOST
        ? AUDIT_ACTIONS.RETAINER_LOST
        : AUDIT_ACTIONS.RETAINER_DISCONTINUED,
      {},
      context,
    );
    return this.hydrate(plan, true);
  }

  async close(
    tenant: TenantContext,
    retentionPlanId: string,
    target: 'COMPLETED' | 'CANCELLED',
    reason: string | null,
    context: MutationContext,
  ): Promise<RetentionPlanDto> {
    const plan = await this.requirePlan(tenant.clinicId, retentionPlanId);
    this.assertOpen(plan);
    const now = new Date();
    const updated = await this.retention.updatePlan(
      tenant.clinicId,
      retentionPlanId,
      target === RETENTION_STATUSES.COMPLETED
        ? { status: target, completedAt: now, completionReason: reason }
        : { status: target, cancelledAt: now, cancellationReason: reason },
      context.actorUserId,
      plan.status,
    );
    if (!updated) throw new ConflictError('Retention plan changed; reload and retry');
    await this.record(
      tenant.clinicId,
      plan.patientId.toString(),
      updated,
      target === RETENTION_STATUSES.COMPLETED
        ? AUDIT_ACTIONS.RETENTION_COMPLETED
        : AUDIT_ACTIONS.RETENTION_CANCELLED,
      { from: plan.status, to: target },
      context,
    );
    return this.hydrate(updated, true);
  }

  private async hydrate(plan: RetentionPlanRecord, includePrivate: boolean): Promise<RetentionPlanDto> {
    return toRetentionPlanDto(
      plan,
      await this.retention.listDevices(plan.clinicId.toString(), plan._id.toString()),
      includePrivate,
    );
  }

  private async requirePlan(
    clinicId: string,
    retentionPlanId: string,
    session?: ClientSession,
  ): Promise<RetentionPlanRecord> {
    const plan = await this.retention.findPlanById(clinicId, retentionPlanId, session);
    if (!plan) throw new NotFoundError('Retention plan not found');
    return plan;
  }

  private assertOpen(plan: RetentionPlanRecord): void {
    if (
      plan.status === RETENTION_STATUSES.COMPLETED ||
      plan.status === RETENTION_STATUSES.CANCELLED
    ) {
      throw new BusinessRuleError('This retention plan is closed');
    }
  }

  private assertDevice(input: RetainerDeviceInput): void {
    const validCustom =
      input.type === RETAINER_TYPES.OTHER
        ? Boolean(input.customTypeLabel?.trim())
        : !input.customTypeLabel;
    if (!validCustom) {
      throw new BusinessRuleError('Custom retainer type is only valid with OTHER');
    }
  }

  private async record(
    clinicId: string,
    patientId: string,
    plan: RetentionPlanRecord,
    action: AuditAction,
    metadata: Record<string, unknown>,
    context: MutationContext,
  ): Promise<void> {
    await this.audit.record({
      clinicId,
      actorUserId: context.actorUserId,
      action,
      resourceType: AUDIT_RESOURCE_TYPES.RETENTION_PLAN,
      resourceId: plan._id.toString(),
      metadata: {
        patientId,
        treatmentId: plan.treatmentId.toString(),
        retentionPlanId: plan._id.toString(),
        ...metadata,
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  private async recordDevice(
    plan: RetentionPlanRecord,
    device: RetainerDeviceRecord,
    action: AuditAction,
    metadata: Record<string, unknown>,
    context: MutationContext,
  ): Promise<void> {
    await this.audit.record({
      clinicId: plan.clinicId.toString(),
      actorUserId: context.actorUserId,
      action,
      resourceType: AUDIT_RESOURCE_TYPES.RETAINER_DEVICE,
      resourceId: device._id.toString(),
      metadata: {
        patientId: plan.patientId.toString(),
        treatmentId: plan.treatmentId.toString(),
        retentionPlanId: plan._id.toString(),
        retainerId: device._id.toString(),
        type: device.type,
        arch: device.arch,
        ...metadata,
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}

export const retentionService = new RetentionService();

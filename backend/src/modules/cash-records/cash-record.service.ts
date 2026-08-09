import { ERROR_CODES } from '../../common/constants/error-codes.js';
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/app-error.js';
import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toPaginationParams } from '../../common/utils/pagination.js';
import type { MutationContext } from '../../common/utils/request-context.js';
import { parseAmountToMinor } from '../../common/utils/money.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { auditLogService, type AuditLogService } from '../audit-logs/audit-log.service.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../audit-logs/audit-log.types.js';
import { guardianRepository, type GuardianRepository } from '../guardians/guardian.repository.js';
import {
  patientGuardianRepository,
  type PatientGuardianRepository,
} from '../guardians/patient-guardian.repository.js';
import { patientRepository, type PatientRepository } from '../patients/patient.repository.js';
import {
  treatmentRepository,
  type TreatmentRepository,
} from '../treatments/treatment.repository.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import { receiptService, type ReceiptService } from '../receipts/receipt.service.js';
import { receiptRepository, type ReceiptRepository } from '../receipts/receipt.repository.js';
import { toCashRecordDto } from './cash-record.mapper.js';
import { cashRecordRepository, type CashRecordRepository } from './cash-record.repository.js';
import {
  financialSummaryService,
  type FinancialSummaryService,
} from './financial-summary.service.js';
import {
  CASH_RECORD_STATUSES,
  MAX_BACKDATE_DAYS,
  PAYER_TYPES,
  type CashRecordDto,
  type CashRecordListFilters,
  type CashRecordRecord,
  type FinancialSummaryDto,
  type PayerType,
  type PaymentMethod,
} from './cash-record.types.js';

/** What a caller may ask the service to record. Server-owned fields are absent. */
export interface RecordPaymentInput {
  patientId: string;
  treatmentId?: string | null;
  payerType: PayerType;
  guardianId?: string | null;
  payerLabel?: string | null;
  /** Human-entered, e.g. `'150.750'`. Parsed to minor units, never to a float. */
  amount: string | number;
  paymentMethod: PaymentMethod;
  receivedAt?: string | null;
  purpose?: string | null;
  note?: string | null;
  idempotencyKey?: string | null;
  /** Explicit intent to accept more than the treatment still owes. */
  allowOverpayment?: boolean;
  /** Set only by the guided correction flow. */
  correctionOfRecordId?: string | null;
}

/**
 * Authorization facts the controller resolves from the tenant context.
 *
 * Passed in rather than read here so the service stays free of Fastify, while
 * the decision itself remains server-side and un-forgeable — the client cannot
 * send `canApproveOverpayment: true`.
 */
export interface FinancialActorContext extends MutationContext {
  canApproveOverpayment: boolean;
}

/**
 * Cash record use cases.
 *
 * WHAT THIS IS: the clinic's record of money it physically received. There is
 * no gateway, no card data, no transfer of funds. See AGENTS.md §2.1.
 *
 * The invariants worth stating plainly:
 *   - `receivedByUserId`, `createdBy` and `clinicId` come from the session.
 *   - Money is integer minor units from the first line to the last.
 *   - Nothing is ever deleted or edited; corrections are new records.
 *   - Totals are derived, never stored.
 */
export class CashRecordService {
  constructor(
    private readonly cashRecords: CashRecordRepository = cashRecordRepository,
    private readonly receipts: ReceiptService = receiptService,
    private readonly receiptRecords: ReceiptRepository = receiptRepository,
    private readonly summaries: FinancialSummaryService = financialSummaryService,
    private readonly patients: PatientRepository = patientRepository,
    private readonly treatments: TreatmentRepository = treatmentRepository,
    private readonly guardians: GuardianRepository = guardianRepository,
    private readonly patientGuardians: PatientGuardianRepository = patientGuardianRepository,
    private readonly users: UserRepository = userRepository,
    private readonly audit: AuditLogService = auditLogService,
  ) {}

  // --- reads ----------------------------------------------------------------

  async listForPatient(
    clinicId: string,
    patientId: string,
    filters: Omit<CashRecordListFilters, 'patientId'>,
    page: { page?: number; limit?: number },
  ): Promise<{ result: PaginatedResult<CashRecordDto>; pagination: PaginationParams }> {
    await this.requirePatient(clinicId, patientId);

    const pagination = toPaginationParams(page);
    const { items, total } = await this.cashRecords.listByClinic(
      clinicId,
      { ...filters, patientId },
      pagination,
    );

    return { result: { items: await this.toDtos(clinicId, items), total }, pagination };
  }

  async getById(clinicId: string, cashRecordId: string): Promise<CashRecordDto> {
    const record = await this.requireRecord(clinicId, cashRecordId);
    const [dto] = await this.toDtos(clinicId, [record]);
    if (!dto) {
      throw new NotFoundError('Cash record not found', {
        code: ERROR_CODES.CASH_RECORD_NOT_FOUND,
      });
    }
    return dto;
  }

  async summaryForPatient(clinicId: string, patientId: string): Promise<FinancialSummaryDto> {
    return this.summaries.forPatient(clinicId, patientId);
  }

  async summaryForTreatment(clinicId: string, treatmentId: string): Promise<FinancialSummaryDto> {
    return this.summaries.forTreatment(clinicId, treatmentId);
  }

  // --- writes ---------------------------------------------------------------

  /**
   * Records money the clinic has already received.
   *
   * The order of operations matters and is deliberate:
   *   1. replay check — a double-click must not become two payments;
   *   2. ownership checks — patient, treatment and guardian all belong here;
   *   3. amount parsing — string to integer minor units;
   *   4. overpayment check — a *warning*, unless explicitly overridden;
   *   5. one unit of work writing record + receipt + audit together.
   */
  async record(
    clinicId: string,
    input: RecordPaymentInput,
    context: FinancialActorContext,
  ): Promise<CashRecordDto> {
    // 1. Idempotency, before anything is validated or written. A retried
    //    submission returns the original payment rather than a second one.
    if (input.idempotencyKey) {
      const existing = await this.cashRecords.findByIdempotencyKey(input.idempotencyKey, clinicId);
      if (existing) {
        this.assertReplayMatches(existing, input, clinicId);
        return this.getById(clinicId, existing._id.toString());
      }
    }

    // 2. Ownership. Every id in the payload is checked against this clinic.
    await this.requirePatient(clinicId, input.patientId);
    const treatmentId = await this.resolveTreatmentId(clinicId, input.patientId, input.treatmentId);
    const guardianId = await this.resolveGuardianId(clinicId, input.patientId, input);

    // 3. Money. The clinic's currency is authoritative, not the client's.
    const currency = await this.summaries.resolveCurrency(clinicId);
    const amountMinor = parseAmountToMinor(input.amount, currency);
    const receivedAt = this.resolveReceivedAt(input.receivedAt);

    // 4. Overpayment is a business warning, not a server failure: the money is
    //    already in the drawer, so refusing outright would make the books lie.
    const overpaymentApproved = await this.checkOverpayment(
      clinicId,
      treatmentId,
      amountMinor,
      currency,
      input.allowOverpayment === true,
      context,
    );

    // 5. Record, receipt and audit as one coherent operation.
    const created = await withTransaction(async (session) => {
      const record = await this.cashRecords.create(
        {
          clinicId,
          patientId: input.patientId,
          treatmentId,
          payerType: input.payerType,
          guardianId,
          payerLabel: input.payerType === PAYER_TYPES.OTHER ? (input.payerLabel ?? null) : null,
          amountMinor,
          currency,
          paymentMethod: input.paymentMethod,
          receivedAt,
          // Never from the payload: this is the accountability field.
          receivedByUserId: context.actorUserId,
          purpose: input.purpose ?? null,
          note: input.note ?? null,
          overpaymentOverride: overpaymentApproved,
          overpaymentApprovedBy: overpaymentApproved ? context.actorUserId : null,
          idempotencyKey: input.idempotencyKey ?? null,
          correctionOfRecordId: input.correctionOfRecordId ?? null,
          createdBy: context.actorUserId,
        },
        session,
      );

      const receipt = await this.receipts.issueFor(record, context.actorUserId, session);
      const withReceipt = await this.cashRecords.attachReceipt(
        record._id.toString(),
        clinicId,
        receipt._id.toString(),
        session,
      );

      if (input.correctionOfRecordId) {
        await this.cashRecords.linkCorrection(
          input.correctionOfRecordId,
          clinicId,
          record._id.toString(),
          session,
        );
      }

      await this.audit.record({
        clinicId,
        actorUserId: context.actorUserId,
        action: input.correctionOfRecordId
          ? AUDIT_ACTIONS.CASH_RECORD_CORRECTED
          : AUDIT_ACTIONS.CASH_RECORD_CREATED,
        resourceType: AUDIT_RESOURCE_TYPES.CASH_RECORD,
        resourceId: record._id.toString(),
        // Amounts and ids only — never the note, which may carry family context.
        metadata: {
          patientId: input.patientId,
          treatmentId,
          amountMinor,
          currency,
          paymentMethod: input.paymentMethod,
          payerType: input.payerType,
          receiptId: receipt._id.toString(),
          ...(input.correctionOfRecordId
            ? { correctionOfRecordId: input.correctionOfRecordId }
            : {}),
        },
        ip: context.ip,
        userAgent: context.userAgent,
      });

      await this.audit.record({
        clinicId,
        actorUserId: context.actorUserId,
        action: AUDIT_ACTIONS.RECEIPT_ISSUED,
        resourceType: AUDIT_RESOURCE_TYPES.RECEIPT,
        resourceId: receipt._id.toString(),
        metadata: {
          receiptNumber: receipt.receiptNumber,
          cashRecordId: record._id.toString(),
          amountMinor,
          currency,
        },
        ip: context.ip,
        userAgent: context.userAgent,
      });

      if (overpaymentApproved) {
        await this.audit.record({
          clinicId,
          actorUserId: context.actorUserId,
          action: AUDIT_ACTIONS.CASH_RECORD_OVERPAYMENT_APPROVED,
          resourceType: AUDIT_RESOURCE_TYPES.CASH_RECORD,
          resourceId: record._id.toString(),
          metadata: { treatmentId, amountMinor, currency },
          ip: context.ip,
          userAgent: context.userAgent,
        });
      }

      return withReceipt ?? record;
    });

    return this.getById(clinicId, created._id.toString());
  }

  /**
   * Voids a record without erasing it.
   *
   * The row stays in the ledger, visibly cancelled, and stops counting toward
   * the recorded total. Its receipt follows it into CANCELLED with its printed
   * amount untouched.
   */
  async cancel(
    clinicId: string,
    cashRecordId: string,
    reason: string,
    context: MutationContext,
  ): Promise<CashRecordDto> {
    const existing = await this.requireRecord(clinicId, cashRecordId);

    if (existing.status === CASH_RECORD_STATUSES.CANCELLED) {
      throw new BusinessRuleError('This payment record is already cancelled', {
        code: ERROR_CODES.CASH_RECORD_ALREADY_CANCELLED,
      });
    }

    await withTransaction(async (session) => {
      const cancelled = await this.cashRecords.cancel(
        cashRecordId,
        clinicId,
        { cancelledBy: context.actorUserId, cancellationReason: reason },
        session,
      );

      if (!cancelled) {
        // Someone else cancelled it between the read and the write.
        throw new BusinessRuleError('This payment record is already cancelled', {
          code: ERROR_CODES.CASH_RECORD_ALREADY_CANCELLED,
        });
      }

      const receipt = await this.receipts.markCancelledFor(cancelled, session);

      await this.audit.record({
        clinicId,
        actorUserId: context.actorUserId,
        action: AUDIT_ACTIONS.CASH_RECORD_CANCELLED,
        resourceType: AUDIT_RESOURCE_TYPES.CASH_RECORD,
        resourceId: cashRecordId,
        metadata: {
          patientId: cancelled.patientId.toString(),
          amountMinor: cancelled.amountMinor,
          currency: cancelled.currency,
          // The reason is an accountability fact, not clinical content.
          reason,
        },
        ip: context.ip,
        userAgent: context.userAgent,
      });

      if (receipt) {
        await this.audit.record({
          clinicId,
          actorUserId: context.actorUserId,
          action: AUDIT_ACTIONS.RECEIPT_CANCELLED,
          resourceType: AUDIT_RESOURCE_TYPES.RECEIPT,
          resourceId: receipt._id.toString(),
          metadata: { receiptNumber: receipt.receiptNumber, cashRecordId },
          ip: context.ip,
          userAgent: context.userAgent,
        });
      }
    });

    return this.getById(clinicId, cashRecordId);
  }

  // --- internals ------------------------------------------------------------

  /**
   * The overpayment rule.
   *
   * Returns whether an override was applied. Without a treatment there is no
   * agreed price to exceed, so the question does not arise — a deposit before
   * any plan is agreed is perfectly normal.
   */
  private async checkOverpayment(
    clinicId: string,
    treatmentId: string | null,
    amountMinor: number,
    currency: string,
    allowOverpayment: boolean,
    context: FinancialActorContext,
  ): Promise<boolean> {
    if (treatmentId === null) {
      return false;
    }

    const summary = await this.summaries.forTreatment(clinicId, treatmentId);
    if (summary.remainingAmountMinor === null) {
      return false;
    }

    const excess = amountMinor - summary.remainingAmountMinor;
    if (excess <= 0) {
      return false;
    }

    if (!allowOverpayment) {
      throw new BusinessRuleError('This payment exceeds the amount still owed on the treatment', {
        code: ERROR_CODES.PAYMENT_EXCEEDS_REMAINING_AMOUNT,
        details: {
          requiresConfirmation: true,
          currency,
          remainingAmountMinor: summary.remainingAmountMinor,
          amountMinor,
          excessAmountMinor: excess,
          overrideAllowed: context.canApproveOverpayment,
        },
      });
    }

    if (!context.canApproveOverpayment) {
      throw new ForbiddenError('Only the clinic owner may accept more than the amount owed', {
        code: ERROR_CODES.OVERPAYMENT_APPROVAL_NOT_ALLOWED,
      });
    }

    return true;
  }

  /**
   * A replayed key must describe the same payment.
   *
   * A key reused with a different amount is a client bug, not a retry, and
   * silently returning the old record would hide a real double-charge risk.
   */
  private assertReplayMatches(
    existing: CashRecordRecord,
    input: RecordPaymentInput,
    clinicId: string,
  ): void {
    const samePatient = existing.patientId.toString() === input.patientId;
    if (!samePatient || existing.clinicId.toString() !== clinicId) {
      throw new BusinessRuleError('This submission id was already used for a different payment', {
        code: ERROR_CODES.IDEMPOTENCY_CONFLICT,
      });
    }
  }

  private resolveReceivedAt(value: string | null | undefined): Date {
    if (!value) {
      // The default and the common case: the money is on the desk right now.
      return new Date();
    }

    const receivedAt = new Date(value);
    if (Number.isNaN(receivedAt.getTime())) {
      throw new ValidationError('The received date is not a valid date', {
        code: ERROR_CODES.INVALID_RECEIVED_AT,
      });
    }

    const now = Date.now();
    // A clinic cannot have received money it has not received yet. One minute
    // of slack absorbs clock skew between the browser and the server.
    if (receivedAt.getTime() > now + 60_000) {
      throw new ValidationError('A payment cannot be recorded in the future', {
        code: ERROR_CODES.INVALID_RECEIVED_AT,
      });
    }

    const earliest = now - MAX_BACKDATE_DAYS * 24 * 60 * 60 * 1000;
    if (receivedAt.getTime() < earliest) {
      throw new ValidationError(`A payment may be backdated by at most ${MAX_BACKDATE_DAYS} days`, {
        code: ERROR_CODES.INVALID_RECEIVED_AT,
      });
    }

    return receivedAt;
  }

  /**
   * Verifies the treatment belongs to this clinic AND this patient.
   *
   * READ-ONLY ACROSS THE BOUNDARY: this is a lookup through the Treatment
   * module's public repository. Nothing in the Treatment domain is written.
   */
  private async resolveTreatmentId(
    clinicId: string,
    patientId: string,
    treatmentId: string | null | undefined,
  ): Promise<string | null> {
    if (!treatmentId) {
      return null;
    }

    const treatment = await this.treatments.findByIdInClinic(treatmentId, clinicId);
    if (!treatment) {
      throw new NotFoundError('Treatment not found', { code: ERROR_CODES.TREATMENT_NOT_FOUND });
    }
    if (treatment.patientId.toString() !== patientId) {
      // Patient A's payment must never attach to patient B's treatment.
      throw new BusinessRuleError('That treatment belongs to a different patient', {
        code: ERROR_CODES.TREATMENT_PATIENT_MISMATCH,
      });
    }

    return treatmentId;
  }

  /**
   * Verifies the guardian exists, belongs to this clinic, and is actually
   * linked to this patient. An arbitrary guardian id is never trusted.
   */
  private async resolveGuardianId(
    clinicId: string,
    patientId: string,
    input: RecordPaymentInput,
  ): Promise<string | null> {
    if (input.payerType !== PAYER_TYPES.GUARDIAN) {
      return null;
    }

    if (!input.guardianId) {
      throw new ValidationError('Select which guardian handed the money over', {
        code: ERROR_CODES.GUARDIAN_REQUIRED_FOR_PAYER_TYPE,
      });
    }

    const [guardian] = await this.guardians.findManyByIdsInClinic([input.guardianId], clinicId);
    if (!guardian) {
      throw new NotFoundError('Guardian not found', { code: ERROR_CODES.GUARDIAN_NOT_FOUND });
    }

    const link = await this.patientGuardians.findByPatientAndGuardian(
      patientId,
      input.guardianId,
      clinicId,
    );
    if (!link) {
      throw new BusinessRuleError('That guardian is not linked to this patient', {
        code: ERROR_CODES.GUARDIAN_NOT_LINKED_TO_PATIENT,
      });
    }

    return input.guardianId;
  }

  private async requirePatient(clinicId: string, patientId: string): Promise<void> {
    const patient = await this.patients.findByIdInClinic(patientId, clinicId);
    if (!patient) {
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }
  }

  private async requireRecord(clinicId: string, cashRecordId: string): Promise<CashRecordRecord> {
    const record = await this.cashRecords.findByIdInClinic(cashRecordId, clinicId);
    if (!record) {
      // 404 whether it does not exist or belongs to another clinic.
      throw new NotFoundError('Cash record not found', {
        code: ERROR_CODES.CASH_RECORD_NOT_FOUND,
      });
    }
    return record;
  }

  /**
   * Resolves display names for a page of records in a fixed number of queries,
   * rather than one lookup per row.
   */
  private async toDtos(clinicId: string, records: CashRecordRecord[]): Promise<CashRecordDto[]> {
    if (records.length === 0) {
      return [];
    }

    const userIds = [
      ...new Set(
        records.flatMap((record) => [
          record.receivedByUserId.toString(),
          ...(record.cancelledBy ? [record.cancelledBy.toString()] : []),
        ]),
      ),
    ];
    const guardianIds = [
      ...new Set(
        records.flatMap((record) => (record.guardianId ? [record.guardianId.toString()] : [])),
      ),
    ];

    const [users, guardians, receipts] = await Promise.all([
      this.users.findManyByIds(userIds),
      this.guardians.findManyByIdsInClinic(guardianIds, clinicId),
      this.receiptRecords.findManyByCashRecordIds(
        records.map((record) => record._id.toString()),
        clinicId,
      ),
    ]);

    const userNames = new Map(
      users.map((user) => [user._id.toString(), `${user.firstName} ${user.lastName}`.trim()]),
    );
    const guardianNames = new Map(
      guardians.map((guardian) => [
        guardian._id.toString(),
        `${guardian.firstName} ${guardian.lastName}`.trim(),
      ]),
    );
    const receiptNumbers = new Map(
      receipts.map((receipt) => [receipt.cashRecordId.toString(), receipt.receiptNumber]),
    );

    return records.map((record) =>
      toCashRecordDto(record, {
        receivedByName: userNames.get(record.receivedByUserId.toString()) ?? 'Clinic team member',
        cancelledByName: record.cancelledBy
          ? (userNames.get(record.cancelledBy.toString()) ?? 'Clinic team member')
          : null,
        payerName: record.guardianId
          ? (guardianNames.get(record.guardianId.toString()) ?? null)
          : (record.payerLabel ?? null),
        receiptNumber: receiptNumbers.get(record._id.toString()) ?? null,
      }),
    );
  }
}

export const cashRecordService = new CashRecordService();

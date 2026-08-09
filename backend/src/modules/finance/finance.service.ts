import type { PaginatedResult, PaginationParams } from '../../common/types/common.types.js';
import { toPaginationParams } from '../../common/utils/pagination.js';
import { DEFAULT_CURRENCY, formatMinor } from '../../common/utils/money.js';
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import { userRepository, type UserRepository } from '../users/user.repository.js';
import { receiptRepository, type ReceiptRepository } from '../receipts/receipt.repository.js';
import { financeRepository, type FinanceRepository } from './finance.repository.js';
import {
  derivePaymentStatus,
  type FinanceActivityEntry,
  type FinanceOverview,
  type PatientBalanceQuery,
  type PatientBalanceRow,
} from './finance.types.js';

/** Start-of-day and start-of-month in the clinic's own calendar. */
interface ClinicPeriods {
  todayStart: Date;
  monthStart: Date;
  nextDayStart: Date;
}

/**
 * The clinic financial operations read model.
 *
 * Everything returned here is derived at read time from `treatments.agreedPrice`
 * and the `cashRecords` ledger. Nothing is persisted, so the dashboard cannot
 * drift from the patient-level Payments view — both read the same truth.
 */
export class FinanceService {
  constructor(
    private readonly finance: FinanceRepository = financeRepository,
    private readonly clinics: ClinicRepository = clinicRepository,
    private readonly users: UserRepository = userRepository,
    private readonly receipts: ReceiptRepository = receiptRepository,
  ) {}

  /**
   * "Today" means the clinic's today.
   *
   * A Tunis clinic closing at 19:00 local is still on the same business day
   * that UTC has already ended, so bucketing by UTC midnight would move the
   * evening's cash into tomorrow's figure. The offset is read from the zone
   * itself rather than assumed, so DST changes need no special case.
   */
  private resolvePeriods(timezone: string, now: Date): ClinicPeriods {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const read = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? '';

    const year = Number(read('year'));
    const month = Number(read('month'));
    const day = Number(read('day'));

    // Midnight local expressed as an instant: take the naive local midnight,
    // then correct by the zone's offset at that moment.
    const localMidnightUtc = Date.UTC(year, month - 1, day);
    const offsetMs = this.zoneOffsetMs(new Date(localMidnightUtc), timezone);

    const todayStart = new Date(localMidnightUtc - offsetMs);
    const monthStartUtc = Date.UTC(year, month - 1, 1);
    const monthStart = new Date(monthStartUtc - this.zoneOffsetMs(new Date(monthStartUtc), timezone));

    return {
      todayStart,
      monthStart,
      nextDayStart: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  /** How far the zone is ahead of UTC at a given instant, in milliseconds. */
  private zoneOffsetMs(instant: Date, timezone: string): number {
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(instant);
    const read = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(formatted.find((part) => part.type === type)?.value ?? '0');

    const asUtc = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour') === 24 ? 0 : read('hour'),
      read('minute'),
      read('second'),
    );
    return asUtc - instant.getTime();
  }

  private async resolveClinic(clinicId: string): Promise<{ currency: string; timezone: string }> {
    const clinic = await this.clinics.findById(clinicId);
    return {
      currency: clinic?.currency?.toUpperCase() || DEFAULT_CURRENCY,
      timezone: clinic?.timezone || 'UTC',
    };
  }

  /**
   * The four summary figures plus the worklist counts.
   *
   * Four aggregations run concurrently; none of them loops over patients.
   */
  async getOverview(clinicId: string, now: Date = new Date()): Promise<FinanceOverview> {
    const { currency, timezone } = await this.resolveClinic(clinicId);
    const periods = this.resolvePeriods(timezone, now);

    const [today, month, totals, cancelledUncorrected] = await Promise.all([
      this.finance.sumReceivedBetween(clinicId, periods.todayStart, periods.nextDayStart),
      this.finance.sumReceivedBetween(clinicId, periods.monthStart, periods.nextDayStart),
      this.finance.aggregateBalanceTotals(clinicId),
      this.finance.countCancelledWithoutCorrection(clinicId),
    ]);

    return {
      summary: {
        currency,
        receivedTodayMinor: today.totalMinor,
        receivedTodayCount: today.count,
        receivedMonthMinor: month.totalMinor,
        receivedMonthCount: month.count,
        outstandingMinor: totals.outstandingMinor,
        outstandingPatientCount: totals.outstandingPatientIds.length,
        activeTreatmentPatientCount: totals.activeTreatmentPatientIds.length,
      },
      attention: {
        // Patients, not treatments: "12 patients owe money" is the sentence an
        // owner actually says, and one patient may hold two courses of care.
        outstandingCount: totals.outstandingPatientIds.length,
        noPaymentCount: totals.noPaymentCount,
        overpaidCount: totals.overpaidCount,
        cancelledUncorrectedCount: cancelledUncorrected,
      },
    };
  }

  async listPatientBalances(
    clinicId: string,
    query: PatientBalanceQuery,
    page: { page?: number; limit?: number },
  ): Promise<{ result: PaginatedResult<PatientBalanceRow>; pagination: PaginationParams }> {
    const pagination = toPaginationParams(page);
    const { items, total } = await this.finance.listPatientBalances(clinicId, query, pagination);

    return {
      result: {
        total,
        items: items.map((row) => {
          const agreedMinor =
            row.agreedPrice !== null && row.agreedPrice > 0
              ? Math.round(row.agreedPrice * 1000)
              : null;
          const recordedMinor = row.recordedMinor;
          const remainingMinor = agreedMinor === null ? null : agreedMinor - recordedMinor;

          return {
            patientId: String(row.patientId),
            patientName: `${row.patientFirstName} ${row.patientLastName}`.trim(),
            treatmentId: String(row._id),
            treatmentLabel: row.customTypeLabel ?? this.formatTreatmentType(row.treatmentType),
            treatmentStatus: row.treatmentStatus,
            agreedMinor,
            recordedMinor,
            remainingMinor,
            overpaidMinor:
              remainingMinor !== null && remainingMinor < 0 ? Math.abs(remainingMinor) : null,
            paymentStatus: derivePaymentStatus(agreedMinor, recordedMinor),
            lastPaymentAt: row.lastPaymentAt ? new Date(row.lastPaymentAt).toISOString() : null,
          };
        }),
      },
      pagination,
    };
  }

  /**
   * The recent movements feed.
   *
   * Actor names and receipt numbers are resolved in two batched lookups, not
   * one per row.
   */
  async listRecentActivity(clinicId: string, limit = 12): Promise<FinanceActivityEntry[]> {
    const { currency } = await this.resolveClinic(clinicId);
    const rows = await this.finance.listRecentActivity(clinicId, limit);
    if (rows.length === 0) {
      return [];
    }

    const userIds = [
      ...new Set(
        rows.flatMap((row) =>
          [row.receivedByUserId, row.cancelledBy].filter(Boolean).map(String),
        ),
      ),
    ];
    const [users, receipts] = await Promise.all([
      this.users.findManyByIds(userIds),
      this.receipts.findManyByCashRecordIds(
        rows.map((row) => String(row._id)),
        clinicId,
      ),
    ]);

    const names = new Map(
      users.map((user) => [user._id.toString(), `${user.firstName} ${user.lastName}`.trim()]),
    );
    const receiptNumbers = new Map(
      receipts.map((receipt) => [receipt.cashRecordId.toString(), receipt.receiptNumber]),
    );

    return rows.map((row) => ({
      cashRecordId: String(row._id),
      patientId: String(row.patientId),
      patientName: `${row.patientFirstName} ${row.patientLastName}`.trim() || 'Patient',
      amountMinor: row.amountMinor,
      currency: row.currency || currency,
      paymentMethod: row.paymentMethod,
      status: row.status,
      receiptNumber: receiptNumbers.get(String(row._id)) ?? null,
      receivedAt: new Date(row.receivedAt).toISOString(),
      receivedByName: names.get(String(row.receivedByUserId)) ?? 'Clinic team member',
      cancelledAt: row.cancelledAt ? new Date(row.cancelledAt).toISOString() : null,
      cancelledByName: row.cancelledBy ? (names.get(String(row.cancelledBy)) ?? null) : null,
      cancellationReason: row.cancellationReason ?? null,
    }));
  }

  /** Presentation only — the Treatment module owns the enum. */
  private formatTreatmentType(type: string): string {
    const words = String(type).toLowerCase().replaceAll('_', ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /** Exposed for tests and any caller that needs the clinic's display format. */
  formatAmount(amountMinor: number, currency: string): string {
    return formatMinor(amountMinor, currency);
  }
}

export const financeService = new FinanceService();

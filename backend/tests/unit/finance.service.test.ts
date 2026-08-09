import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicRepository } from '../../src/modules/clinics/clinic.repository.js';
import type { ReceiptRepository } from '../../src/modules/receipts/receipt.repository.js';
import type { UserRepository } from '../../src/modules/users/user.repository.js';
import type { FinanceRepository } from '../../src/modules/finance/finance.repository.js';
import { FinanceService } from '../../src/modules/finance/finance.service.js';
import {
  BALANCE_FILTERS,
  PAYMENT_STATUSES,
  derivePaymentStatus,
} from '../../src/modules/finance/finance.types.js';

const CLINIC_A = '652f1c9b8a1e4f0012ab34cd';
const PATIENT_ID = '652f1c9b8a1e4f0012abaaaa';
const USER_ID = '652f1c9b8a1e4f0012ab0001';

function balanceRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId('652f1c9b8a1e4f0012abcccc'),
    patientId: new Types.ObjectId(PATIENT_ID),
    patientFirstName: 'Ahmed',
    patientLastName: 'Ben Salah',
    treatmentType: 'METAL_BRACES',
    customTypeLabel: null,
    treatmentStatus: 'ACTIVE',
    agreedPrice: 3600,
    recordedMinor: 1_400_000,
    lastPaymentAt: new Date('2026-08-09T09:42:00.000Z'),
    ...overrides,
  };
}

describe('derivePaymentStatus', () => {
  it('reports NO_AGREED_PRICE when there is no price to measure against', () => {
    // Distinct from "nothing owed": we simply cannot say what is outstanding.
    expect(derivePaymentStatus(null, 0)).toBe(PAYMENT_STATUSES.NO_AGREED_PRICE);
    expect(derivePaymentStatus(null, 500_000)).toBe(PAYMENT_STATUSES.NO_AGREED_PRICE);
    expect(derivePaymentStatus(0, 0)).toBe(PAYMENT_STATUSES.NO_AGREED_PRICE);
  });

  it('reports NO_PAYMENT for an agreed treatment with nothing recorded', () => {
    expect(derivePaymentStatus(3_000_000, 0)).toBe(PAYMENT_STATUSES.NO_PAYMENT);
  });

  it('reports PARTIALLY_PAID between zero and the agreed price', () => {
    expect(derivePaymentStatus(3_600_000, 1_400_000)).toBe(PAYMENT_STATUSES.PARTIALLY_PAID);
    expect(derivePaymentStatus(3_600_000, 3_599_999)).toBe(PAYMENT_STATUSES.PARTIALLY_PAID);
  });

  it('reports PAID only on an exact match', () => {
    expect(derivePaymentStatus(4_200_000, 4_200_000)).toBe(PAYMENT_STATUSES.PAID);
  });

  it('reports OVERPAID above the agreed price', () => {
    expect(derivePaymentStatus(2_500_000, 2_600_000)).toBe(PAYMENT_STATUSES.OVERPAID);
  });

  it('lands every combination on exactly one status', () => {
    // Totality matters: the table, the counters and the filters all read this.
    for (const agreed of [null, 0, 1000, 5000]) {
      for (const recorded of [0, 1000, 5000, 9000]) {
        expect(Object.values(PAYMENT_STATUSES)).toContain(derivePaymentStatus(agreed, recorded));
      }
    }
  });
});

describe('FinanceService', () => {
  let finance: Record<string, ReturnType<typeof vi.fn>>;
  let clinics: { findById: ReturnType<typeof vi.fn> };
  let users: { findManyByIds: ReturnType<typeof vi.fn> };
  let receipts: { findManyByCashRecordIds: ReturnType<typeof vi.fn> };
  let service: FinanceService;

  beforeEach(() => {
    finance = {
      listPatientBalances: vi.fn(async () => ({ items: [balanceRow()], total: 1 })),
      sumReceivedBetween: vi.fn(async () => ({ totalMinor: 850_000, count: 7 })),
      aggregateBalanceTotals: vi.fn(async () => ({
        outstandingMinor: 28_700_000,
        outstandingPatientIds: ['a', 'b', 'c'],
        noPaymentCount: 5,
        overpaidCount: 2,
        activeTreatmentPatientIds: ['a', 'b', 'c', 'd'],
      })),
      countCancelledWithoutCorrection: vi.fn(async () => 3),
      listRecentActivity: vi.fn(async () => []),
    };
    clinics = {
      findById: vi.fn(async () => ({ currency: 'TND', timezone: 'Africa/Tunis' })),
    };
    users = { findManyByIds: vi.fn(async () => []) };
    receipts = { findManyByCashRecordIds: vi.fn(async () => []) };

    service = new FinanceService(
      finance as unknown as FinanceRepository,
      clinics as unknown as ClinicRepository,
      users as unknown as UserRepository,
      receipts as unknown as ReceiptRepository,
    );
  });

  describe('overview', () => {
    it('reports received, outstanding and the attention worklist', async () => {
      const overview = await service.getOverview(CLINIC_A);

      expect(overview.summary).toMatchObject({
        currency: 'TND',
        receivedTodayMinor: 850_000,
        receivedTodayCount: 7,
        outstandingMinor: 28_700_000,
        outstandingPatientCount: 3,
        activeTreatmentPatientCount: 4,
      });
      expect(overview.attention).toEqual({
        outstandingCount: 3,
        noPaymentCount: 5,
        overpaidCount: 2,
        cancelledUncorrectedCount: 3,
      });
    });

    it('buckets "today" by the clinic calendar, not by UTC', async () => {
      // 00:30 on the 10th in Tunis (UTC+1) is still 23:30 UTC on the 9th. The
      // day window must start at the clinic's midnight, or the previous
      // evening's cash lands in the wrong day.
      await service.getOverview(CLINIC_A, new Date('2026-08-09T23:30:00.000Z'));

      const [, todayStart, nextDayStart] = finance['sumReceivedBetween']?.mock.calls[0] ?? [];
      expect((todayStart as Date).toISOString()).toBe('2026-08-09T23:00:00.000Z');
      expect((nextDayStart as Date).toISOString()).toBe('2026-08-10T23:00:00.000Z');
    });

    it('starts the month window at the clinic month boundary', async () => {
      await service.getOverview(CLINIC_A, new Date('2026-08-09T12:00:00.000Z'));

      const monthCall = finance['sumReceivedBetween']?.mock.calls[1] ?? [];
      expect((monthCall[1] as Date).toISOString()).toBe('2026-07-31T23:00:00.000Z');
    });

    it('falls back to a sane currency and zone for an unconfigured clinic', async () => {
      clinics.findById.mockResolvedValueOnce(null);
      const overview = await service.getOverview(CLINIC_A);
      expect(overview.summary.currency).toBe('TND');
    });
  });

  describe('patient balances', () => {
    it('derives amounts and status from the agreed price and the ledger', async () => {
      const { result } = await service.listPatientBalances(CLINIC_A, {}, {});
      const row = result.items[0];

      expect(row).toMatchObject({
        patientName: 'Ahmed Ben Salah',
        treatmentLabel: 'Metal braces',
        // 3600 major units → 3,600,000 millimes.
        agreedMinor: 3_600_000,
        recordedMinor: 1_400_000,
        remainingMinor: 2_200_000,
        overpaidMinor: null,
        paymentStatus: PAYMENT_STATUSES.PARTIALLY_PAID,
      });
      expect(row?.lastPaymentAt).toBe('2026-08-09T09:42:00.000Z');
    });

    it('reports an overpayment as a positive excess', async () => {
      finance['listPatientBalances']?.mockResolvedValueOnce({
        items: [balanceRow({ agreedPrice: 2500, recordedMinor: 2_600_000 })],
        total: 1,
      });

      const { result } = await service.listPatientBalances(CLINIC_A, {}, {});
      expect(result.items[0]).toMatchObject({
        remainingMinor: -100_000,
        overpaidMinor: 100_000,
        paymentStatus: PAYMENT_STATUSES.OVERPAID,
      });
    });

    it('leaves remaining null when no price was agreed', async () => {
      finance['listPatientBalances']?.mockResolvedValueOnce({
        items: [balanceRow({ agreedPrice: null, recordedMinor: 500_000 })],
        total: 1,
      });

      const { result } = await service.listPatientBalances(CLINIC_A, {}, {});
      expect(result.items[0]).toMatchObject({
        agreedMinor: null,
        // Not zero: "nothing left to pay" and "no price agreed" differ.
        remainingMinor: null,
        paymentStatus: PAYMENT_STATUSES.NO_AGREED_PRICE,
      });
    });

    it('marks an agreed treatment with no money as NO_PAYMENT', async () => {
      finance['listPatientBalances']?.mockResolvedValueOnce({
        items: [balanceRow({ agreedPrice: 3000, recordedMinor: 0 })],
        total: 1,
      });

      const { result } = await service.listPatientBalances(CLINIC_A, {}, {});
      expect(result.items[0]?.paymentStatus).toBe(PAYMENT_STATUSES.NO_PAYMENT);
      expect(result.items[0]?.remainingMinor).toBe(3_000_000);
    });

    it('prefers a clinic custom treatment label over the enum', async () => {
      finance['listPatientBalances']?.mockResolvedValueOnce({
        items: [balanceRow({ customTypeLabel: 'Invisalign Full' })],
        total: 1,
      });

      const { result } = await service.listPatientBalances(CLINIC_A, {}, {});
      expect(result.items[0]?.treatmentLabel).toBe('Invisalign Full');
    });

    it('passes filter, sort and search through to the aggregation', async () => {
      await service.listPatientBalances(
        CLINIC_A,
        { filter: BALANCE_FILTERS.OUTSTANDING, search: 'ahmed' },
        { page: 2, limit: 25 },
      );

      expect(finance['listPatientBalances']).toHaveBeenCalledWith(
        CLINIC_A,
        expect.objectContaining({ filter: BALANCE_FILTERS.OUTSTANDING, search: 'ahmed' }),
        expect.objectContaining({ limit: 25 }),
      );
    });
  });

  describe('recent activity', () => {
    it('resolves actor names and receipt numbers in batches', async () => {
      const cashRecordId = new Types.ObjectId('652f1c9b8a1e4f0012ac0001');
      finance['listRecentActivity']?.mockResolvedValueOnce([
        {
          _id: cashRecordId,
          patientId: new Types.ObjectId(PATIENT_ID),
          patientFirstName: 'Ahmed',
          patientLastName: 'Ben Salah',
          amountMinor: 200_000,
          currency: 'TND',
          paymentMethod: 'CASH',
          status: 'RECORDED',
          receivedAt: new Date('2026-08-09T13:32:00.000Z'),
          receivedByUserId: new Types.ObjectId(USER_ID),
          cancelledAt: null,
          cancelledBy: null,
          cancellationReason: null,
        },
      ]);
      users.findManyByIds.mockResolvedValueOnce([
        { _id: new Types.ObjectId(USER_ID), firstName: 'Sarah', lastName: 'Gharbi' },
      ]);
      receipts.findManyByCashRecordIds.mockResolvedValueOnce([
        { cashRecordId, receiptNumber: 'REC-2026-000043' },
      ]);

      const activity = await service.listRecentActivity(CLINIC_A);

      expect(activity[0]).toMatchObject({
        patientName: 'Ahmed Ben Salah',
        amountMinor: 200_000,
        receivedByName: 'Sarah Gharbi',
        receiptNumber: 'REC-2026-000043',
        status: 'RECORDED',
      });
      // One lookup each, never one per row.
      expect(users.findManyByIds).toHaveBeenCalledTimes(1);
      expect(receipts.findManyByCashRecordIds).toHaveBeenCalledTimes(1);
    });

    it('skips the lookups entirely when there is nothing to show', async () => {
      const activity = await service.listRecentActivity(CLINIC_A);
      expect(activity).toEqual([]);
      expect(users.findManyByIds).not.toHaveBeenCalled();
    });
  });
});

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import {
  CLINIC_A,
  CLINIC_B,
  PATIENT_ID,
  resetRepositoryMocks,
  resetTestState,
  testState,
} from '../helpers/repository-mocks.js';
import { authHeader, createTestApp } from '../helpers/test-app.js';
import { receptionService } from '../../src/modules/reception/reception.service.js';
import { financeService } from '../../src/modules/finance/finance.service.js';
import { followUpService } from '../../src/modules/follow-ups/follow-up.service.js';
import { careContinuityService } from '../../src/modules/follow-ups/care-continuity.service.js';
import { dashboardRepository } from '../../src/modules/dashboard/dashboard.repository.js';
import { AUDIT_ACTIONS } from '../../src/modules/audit-logs/audit-log.types.js';

vi.mock('../../src/modules/users/user.repository.js', async () => ({
  userRepository: (await import('../helpers/repository-mocks.js')).userRepositoryMock,
}));
vi.mock('../../src/modules/auth/auth-session.repository.js', async () => ({
  authSessionRepository: (await import('../helpers/repository-mocks.js')).authSessionRepositoryMock,
}));
vi.mock('../../src/modules/memberships/membership.repository.js', async () => ({
  membershipRepository: (await import('../helpers/repository-mocks.js')).membershipRepositoryMock,
}));
vi.mock('../../src/modules/clinics/clinic.repository.js', async () => ({
  clinicRepository: (await import('../helpers/repository-mocks.js')).clinicRepositoryMock,
}));
vi.mock('../../src/modules/patients/patient.repository.js', async () => ({
  patientRepository: (await import('../helpers/repository-mocks.js')).patientRepositoryMock,
}));
vi.mock('../../src/modules/guardians/guardian.repository.js', async () => ({
  guardianRepository: (await import('../helpers/repository-mocks.js')).guardianRepositoryMock,
}));
vi.mock('../../src/modules/guardians/patient-guardian.repository.js', async () => ({
  patientGuardianRepository: (await import('../helpers/repository-mocks.js'))
    .patientGuardianRepositoryMock,
}));
vi.mock('../../src/modules/audit-logs/audit-log.repository.js', async () => ({
  auditLogRepository: (await import('../helpers/repository-mocks.js')).auditLogRepositoryMock,
}));
vi.mock('../../src/modules/tasks/task.repository.js', async () => ({
  taskRepository: (await import('../helpers/repository-mocks.js')).taskRepositoryMock,
}));

describe('Operational Dashboard endpoint (GET /api/v1/dashboard)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetTestState();
    resetRepositoryMocks();
    vi.restoreAllMocks();

    vi.spyOn(dashboardRepository, 'countMinorsWithoutPrimaryGuardian').mockResolvedValue(0);
    vi.spyOn(dashboardRepository, 'getRecentActivityLogs').mockResolvedValue([]);
    vi.spyOn(dashboardRepository, 'getClinicSetupCounts').mockResolvedValue({
      appointmentTypesCount: 5,
      membersCount: 3,
    });

    vi.spyOn(receptionService, 'getToday').mockResolvedValue({
      date: '2026-08-22',
      timezone: 'Africa/Tunis',
      generatedAt: new Date().toISOString(),
      summary: {
        total: 0,
        completed: 0,
        waiting: 0,
        inTreatment: 0,
        late: 0,
        upcoming: 0,
        noShow: 0,
        cancelled: 0,
      },
      rows: [],
    });

    vi.spyOn(financeService, 'getOverview').mockResolvedValue({
      summary: {
        currency: 'TND',
        receivedTodayMinor: 0,
        receivedTodayCount: 0,
        receivedMonthMinor: 0,
        receivedMonthCount: 0,
        outstandingMinor: 0,
        outstandingPatientCount: 0,
        activeTreatmentPatientCount: 0,
        totalAgreedMinor: 0,
        totalRecordedMinor: 0,
        collectedPercent: 0,
      },
      attention: {
        outstandingCount: 0,
        noPaymentCount: 0,
        overpaidCount: 0,
        cancelledUncorrectedCount: 0,
        overpaidExcessMinor: 0,
        outstandingMinor: 0,
      },
      distribution: {
        paid: 0,
        partiallyPaid: 0,
        noPayment: 0,
        overpaid: 0,
        noAgreedPrice: 0,
        overpaidExcessMinor: 0,
      },
    });

    vi.spyOn(followUpService, 'list').mockResolvedValue({
      summary: {
        needsScheduling: 0,
        overdue: 0,
        scheduled: 0,
      },
      rows: [],
      pagination: { total: 0, page: 1, limit: 10, pages: 0 },
    });
    vi.spyOn(careContinuityService, 'list').mockResolvedValue({
      summary: { needsAttention: 0, lostToFollowUp: 0 },
      rows: [],
      pagination: { total: 0, page: 1, limit: 1, pages: 0 },
    });
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns complete operational overview for clinic owner with live data and attention items', async () => {
    const today = new Date();
    const startTime = new Date(today);
    startTime.setHours(10, 30, 0, 0);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + 30);

    vi.spyOn(receptionService, 'getToday').mockResolvedValueOnce({
      date: '2026-08-22',
      timezone: 'Africa/Tunis',
      generatedAt: today.toISOString(),
      summary: {
        total: 12,
        completed: 8,
        waiting: 2,
        inTreatment: 1,
        late: 1,
        upcoming: 0,
        noShow: 0,
        cancelled: 0,
      },
      rows: [
        {
          appointmentId: '507f1f77bcf86cd799439011',
          patientId: PATIENT_ID,
          patientName: 'Rayen Mestiri',
          appointmentTypeName: 'Contrôle orthodontique',
          treatmentLabel: 'Appareil métallique',
          startAt: startTime.toISOString(),
          endAt: endTime.toISOString(),
          durationMinutes: 30,
          status: 'WAITING',
          flowGroup: 'WAITING',
          lateByMinutes: null,
          arrivedAt: startTime.toISOString(),
          waitingAt: startTime.toISOString(),
          treatmentStartedAt: null,
          completedAt: null,
          noShowAt: null,
          note: null,
          cancellationReason: null,
        },
      ],
    });

    vi.spyOn(financeService, 'getOverview').mockResolvedValueOnce({
      summary: {
        currency: 'TND',
        receivedTodayMinor: 850000,
        receivedTodayCount: 4,
        receivedMonthMinor: 12450000,
        receivedMonthCount: 22,
        outstandingMinor: 13900000,
        outstandingPatientCount: 15,
        activeTreatmentPatientCount: 45,
        totalAgreedMinor: 45000000,
        totalRecordedMinor: 31100000,
        collectedPercent: 67,
      },
      attention: {
        outstandingCount: 15,
        noPaymentCount: 5,
        overpaidCount: 0,
        cancelledUncorrectedCount: 2,
        overpaidExcessMinor: 0,
        outstandingMinor: 0,
      },
      distribution: {
        paid: 0,
        partiallyPaid: 0,
        noPayment: 0,
        overpaid: 0,
        noAgreedPrice: 0,
        overpaidExcessMinor: 0,
      },
    });

    vi.spyOn(followUpService, 'list').mockResolvedValueOnce({
      summary: {
        needsScheduling: 6,
        overdue: 2,
        scheduled: 4,
      },
      rows: [
        {
          patient: { id: PATIENT_ID, fullName: 'Rayen Mestiri', phone: '+216 20 100 200' },
          treatment: { id: 'trt-1', label: 'Appareil métallique', status: 'ACTIVE' },
          sourceVisit: {
            id: 'vis-1',
            startedAt: today.toISOString(),
            completedAt: today.toISOString(),
          },
          recommendedAt: today.toISOString(),
          appointment: null,
          state: 'OVERDUE',
          daysFromRecommendation: 7,
        },
      ],
      pagination: { total: 1, page: 1, limit: 10, pages: 1 },
    });

    vi.spyOn(dashboardRepository, 'getRecentActivityLogs').mockResolvedValueOnce([
      {
        _id: '507f1f77bcf86cd799439099',
        action: AUDIT_ACTIONS.CASH_RECORD_CREATED,
        actorUserId: testState.activeUserId,
        actorName: 'Dr Aymen',
        createdAt: today,
        metadata: { patientId: PATIENT_ID, amountMinor: 500000, currency: 'TND' },
        patientId: PATIENT_ID,
        patientName: 'Rayen Mestiri',
      },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: authHeader(testState.activeUserId, CLINIC_A),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();

    // Verify Today section
    expect(body.data.today).toBeDefined();
    expect(body.data.today.summary.waiting).toBe(2);
    expect(body.data.today.nextPatient).toBeDefined();
    expect(body.data.today.nextPatient.patientName).toBe('Rayen Mestiri');

    // Verify Finance section (Owner has CASH_RECORD_READ)
    expect(body.data.finance).toBeDefined();
    expect(body.data.finance.currency).toBe('TND');
    expect(body.data.finance.receivedTodayMinor).toBe(850000);
    expect(body.data.finance.collectedPercent).toBe(67);

    // Verify Follow-ups section
    expect(body.data.followUps).toBeDefined();
    expect(body.data.followUps.summary.overdue).toBe(2);

    // Verify Attention items
    expect(body.data.attention.length).toBeGreaterThan(0);
    const overdueItem = body.data.attention.find(
      (item: { id: string }) => item.id === 'overdue_followups',
    );
    expect(overdueItem).toBeDefined();
    expect(overdueItem.count).toBe(2);

    const noPaymentItem = body.data.attention.find(
      (item: { id: string }) => item.id === 'no_payment_treatments',
    );
    expect(noPaymentItem).toBeDefined();

    // Verify Recent Activity
    expect(body.data.recentActivity.length).toBe(1);
    expect(body.data.recentActivity[0].type).toBe('PAYMENT_RECORDED');

    // Verify Setup Status
    expect(body.data.setup).toBeDefined();
    expect(typeof body.data.setup.isComplete).toBe('boolean');
  });

  it('respects tenant isolation — does not return records from other clinics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: authHeader(testState.activeUserId, CLINIC_B),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.today.summary.total).toBe(0);
    expect(body.data.today.nextPatient).toBeNull();
    expect(body.data.today.waitingPatients).toEqual([]);
  });

  it('omits finance metrics when user lacks CASH_RECORD_READ permission', async () => {
    testState.membershipRole = CLINIC_ROLES.ASSISTANT;

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: authHeader(testState.activeUserId, CLINIC_A),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.finance).toBeNull();
    expect(body.data.today).toBeDefined();
  });
});

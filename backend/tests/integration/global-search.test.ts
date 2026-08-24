import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLINIC_ROLES } from '../../src/common/constants/roles.js';
import {
  CLINIC_A,
  PATIENT_ID,
  resetRepositoryMocks,
  resetTestState,
  testState,
} from '../helpers/repository-mocks.js';
import { authHeader, createTestApp } from '../helpers/test-app.js';
import { PatientModel } from '../../src/modules/patients/patient.model.js';
import { ReceiptModel } from '../../src/modules/receipts/receipt.model.js';
import { TreatmentModel } from '../../src/modules/treatments/treatment.model.js';
import { AppointmentModel } from '../../src/modules/appointments/appointment.model.js';
import { AppointmentTypeModel } from '../../src/modules/appointment-types/appointment-type.model.js';
import { PatientMediaModel } from '../../src/modules/patient-media/patient-media.model.js';

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

describe('Global Search endpoint', () => {
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

    vi.spyOn(PatientModel, 'find').mockReturnValue({
      limit: () => ({ lean: async () => [] }),
      lean: async () => [],
    } as never);

    vi.spyOn(TreatmentModel, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
      lean: async () => [],
    } as never);

    vi.spyOn(ReceiptModel, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
      lean: async () => [],
    } as never);

    vi.spyOn(AppointmentTypeModel, 'find').mockReturnValue({ lean: async () => [] } as never);
    vi.spyOn(AppointmentModel, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
      lean: async () => [],
    } as never);
    vi.spyOn(PatientMediaModel, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
      lean: async () => [],
    } as never);
  });

  it('rejects queries shorter than 2 characters with 400 Bad Request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=a',
      headers: authHeader(CLINIC_A),
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns grouped search results for a matching patient name', async () => {
    vi.spyOn(PatientModel, 'find').mockReturnValue({
      limit: () => ({
        lean: async () => [
          {
            _id: PATIENT_ID,
            firstName: 'Rayen',
            lastName: 'Mestiri',
            referenceNumber: 'PAT-0001',
            birthDate: new Date('2010-05-15'),
            phone: '+216 22 000 000',
            status: 'ACTIVE',
          },
        ],
      }),
    } as never);

    vi.spyOn(TreatmentModel, 'find').mockImplementation((filter: unknown) => {
      const query = filter as { patientId?: { $in?: unknown } };
      // If querying for active treatments by patientId ($in)
      if (query.patientId?.$in) {
        return {
          lean: async () => [
            {
              _id: 'treatment-1',
              patientId: PATIENT_ID,
              type: 'METAL_BRACES',
              customTypeLabel: 'Bagues métalliques',
              status: 'ACTIVE',
            },
          ],
        } as never;
      }
      // If querying for treatments search
      return {
        sort: () => ({
          limit: () => ({
            lean: async () => [],
          }),
        }),
        lean: async () => [],
      } as never;
    });

    vi.spyOn(ReceiptModel, 'find').mockReturnValue({
      sort: () => ({
        limit: () => ({
          lean: async () => [],
        }),
      }),
    } as never);

    vi.spyOn(AppointmentTypeModel, 'find').mockReturnValue({
      lean: async () => [],
    } as never);

    vi.spyOn(AppointmentModel, 'find').mockReturnValue({
      sort: () => ({
        limit: () => ({
          lean: async () => [],
        }),
      }),
    } as never);

    vi.spyOn(PatientMediaModel, 'find').mockReturnValue({
      sort: () => ({
        limit: () => ({
          lean: async () => [],
        }),
      }),
    } as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=rayen',
      headers: authHeader(CLINIC_A),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.query).toBe('rayen');
    expect(body.data.totalMatches).toBe(1);
    expect(body.data.groups.length).toBe(1);
    expect(body.data.groups[0].category).toBe('PATIENTS');
    expect(body.data.groups[0].items[0].title).toBe('Rayen Mestiri');
    expect(body.data.groups[0].items[0].subtitle).toContain('+216 22 000 000');
    expect(body.data.groups[0].items[0].subtitle).toContain('Bagues métalliques · En cours');
    expect(body.data.groups[0].items[0].route).toEqual(['/app/patients', PATIENT_ID]);
  });

  it('safely handles regex special characters without crashing', async () => {
    vi.spyOn(PatientModel, 'find').mockReturnValue({
      limit: () => ({
        lean: async () => [],
      }),
    } as never);
    vi.spyOn(TreatmentModel, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
      lean: async () => [],
    } as never);
    vi.spyOn(ReceiptModel, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
    } as never);
    vi.spyOn(AppointmentTypeModel, 'find').mockReturnValue({ lean: async () => [] } as never);
    vi.spyOn(AppointmentModel, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
    } as never);
    vi.spyOn(PatientMediaModel, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
    } as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=((((.*+?',
      headers: authHeader(CLINIC_A),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.totalMatches).toBe(0);
  });

  it('prioritizes receipts category when query starts with REC-', async () => {
    vi.spyOn(PatientModel, 'find').mockReturnValue({
      limit: () => ({
        lean: async () => [
          {
            _id: PATIENT_ID,
            firstName: 'Rayen',
            lastName: 'Mestiri',
            referenceNumber: 'PAT-0001',
            birthDate: null,
            phone: null,
            status: 'ACTIVE',
          },
        ],
      }),
      lean: async () => [
        {
          _id: PATIENT_ID,
          firstName: 'Rayen',
          lastName: 'Mestiri',
          referenceNumber: 'PAT-0001',
          birthDate: null,
          phone: null,
          status: 'ACTIVE',
        },
      ],
    } as never);

    vi.spyOn(TreatmentModel, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
      lean: async () => [],
    } as never);

    vi.spyOn(ReceiptModel, 'find').mockReturnValue({
      sort: () => ({
        limit: () => ({
          lean: async () => [
            {
              _id: 'receipt-1',
              receiptNumber: 'REC-2026-000052',
              patientId: PATIENT_ID,
              amountMinor: 200000,
              currency: 'TND',
              issuedAt: new Date('2026-08-12T10:00:00Z'),
              status: 'ISSUED',
            },
          ],
        }),
      }),
    } as never);

    vi.spyOn(AppointmentTypeModel, 'find').mockReturnValue({ lean: async () => [] } as never);
    vi.spyOn(AppointmentModel, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
    } as never);
    vi.spyOn(PatientMediaModel, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
    } as never);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=REC-2026',
      headers: authHeader(CLINIC_A),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.groups[0].category).toBe('RECEIPTS');
    expect(body.data.groups[0].items[0].title).toBe('REC-2026-000052');
    expect(body.data.groups[0].items[0].subtitle).toContain('200.000 TND');
  });

  it('filters out restricted categories for Assistant role lacking permissions', async () => {
    testState.membershipRole = CLINIC_ROLES.ASSISTANT;

    vi.spyOn(PatientModel, 'find').mockReturnValue({
      limit: () => ({
        lean: async () => [
          {
            _id: PATIENT_ID,
            firstName: 'Rayen',
            lastName: 'Mestiri',
            referenceNumber: 'PAT-0001',
            birthDate: null,
            phone: null,
            status: 'ACTIVE',
          },
        ],
      }),
      lean: async () => [],
    } as never);

    const receiptSpy = vi.spyOn(ReceiptModel, 'find');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=rayen',
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    // Assistants do not have CASH_RECORD_READ / RECEIPT_READ permission, so receipts must not be queried
    expect(receiptSpy).not.toHaveBeenCalled();
  });
});

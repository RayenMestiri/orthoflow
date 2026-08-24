import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationConditionService } from '../../src/modules/notifications/notification-condition.service.js';
import type { FastifyBaseLogger } from 'fastify';
import type { ClinicRepository } from '../../src/modules/clinics/clinic.repository.js';
import type { CareContinuityService } from '../../src/modules/follow-ups/care-continuity.service.js';
import type { CommunicationEventService } from '../../src/modules/notifications/notification.service.js';
import { NOTIFICATION_TYPES } from '../../src/modules/notifications/notification.types.js';

describe('NotificationConditionService', () => {
  let clinics: { listActiveAfter: ReturnType<typeof vi.fn> };
  let continuity: { list: ReturnType<typeof vi.fn> };
  let events: { enqueue: ReturnType<typeof vi.fn> };
  let log: { error: ReturnType<typeof vi.fn> };
  let service: NotificationConditionService;

  beforeEach(() => {
    clinics = { listActiveAfter: vi.fn() };
    continuity = { list: vi.fn() };
    events = { enqueue: vi.fn().mockResolvedValue(undefined) };
    log = { error: vi.fn() };
    service = new NotificationConditionService(
      clinics as unknown as ClinicRepository,
      continuity as unknown as CareContinuityService,
      events as unknown as CommunicationEventService,
    );
  });

  it('emits a stable condition-cycle event for each attention row', async () => {
    const clinicId = new Types.ObjectId();
    clinics.listActiveAfter.mockResolvedValueOnce([{ _id: clinicId }]);
    continuity.list.mockResolvedValue({
      rows: [
        {
          patient: { id: 'patient-1', fullName: 'Ines Mansour' },
          context: {
            type: 'RETENTION',
            retentionPlanId: 'retention-1',
            treatment: { id: 'treatment-1' },
          },
          lastClinicalAt: '2026-04-10T09:00:00.000Z',
          recommendedAt: '2026-07-10T09:00:00.000Z',
          missedAppointment: { id: 'appointment-1' },
          reasons: ['MISSED_APPOINTMENT', 'OVERDUE'],
          state: 'ATTENTION',
        },
      ],
    });
    const now = new Date('2026-08-24T09:00:00.000Z');

    await expect(service.sweep(log as unknown as FastifyBaseLogger, now)).resolves.toBe(1);

    expect(events.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: clinicId.toString(),
        type: NOTIFICATION_TYPES.CARE_CONTINUITY_ATTENTION,
        aggregateType: 'RETENTION_PLAN',
        aggregateId: 'retention-1',
        deduplicationKey:
          'CARE_CONTINUITY:patient-1:RETENTION:retention-1:2026-04-10T09:00:00.000Z:2026-07-10T09:00:00.000Z:appointment-1',
        occurredAt: now,
      }),
    );
  });

  it('releases its running guard after an error so a later sweep can recover', async () => {
    clinics.listActiveAfter
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce([]);

    await expect(service.sweep(log as unknown as FastifyBaseLogger)).resolves.toBe(0);
    await expect(service.sweep(log as unknown as FastifyBaseLogger)).resolves.toBe(0);

    expect(clinics.listActiveAfter).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledOnce();
  });
});

import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { FollowUpService } from '../../src/modules/follow-ups/follow-up.service.js';

describe('FollowUpService', () => {
  it('keeps tenant, filters, sorting and pagination on the repository query', async () => {
    const clinicId = new Types.ObjectId().toString();
    const repository = {
      list: vi.fn().mockResolvedValue({ summary: [], rows: [], total: [] }),
    };
    const clinics = { findById: vi.fn().mockResolvedValue({ timezone: 'Africa/Lagos' }) };
    const service = new FollowUpService(repository, clinics as never);

    const result = await service.list(
      clinicId,
      { filter: 'OVERDUE', sort: 'PATIENT_NAME', search: 'Amina' },
      { page: 3, limit: 10 },
      new Date('2026-08-15T10:00:00.000Z'),
    );

    expect(repository.list).toHaveBeenCalledWith(
      clinicId,
      'Africa/Lagos',
      expect.any(Date),
      { filter: 'OVERDUE', sort: 'PATIENT_NAME', search: 'Amina' },
      { page: 3, limit: 10, skip: 20 },
    );
    expect(result).toEqual({
      summary: { needsScheduling: 0, overdue: 0, scheduled: 0 },
      rows: [],
      pagination: { page: 3, limit: 10, total: 0, pages: 0 },
    });
  });
});

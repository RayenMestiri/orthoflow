import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { portalRepository } from '../../src/modules/portal/portal.repository.js';
import { userRepository } from '../../src/modules/users/user.repository.js';
import { GuardianModel } from '../../src/modules/guardians/guardian.model.js';
import { clinicRepository } from '../../src/modules/clinics/clinic.repository.js';
import { Types } from 'mongoose';

describe('Portal Forgot and Reset Password routes - Full scenario coverage', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ withDatabase: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects with PORTAL_ACCOUNT_NOT_FOUND when email does not exist anywhere', async () => {
    vi.spyOn(portalRepository, 'findUserByEmail').mockResolvedValue(null);
    vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);
    vi.spyOn(GuardianModel, 'findOne').mockReturnValue({
      lean: () => ({ exec: async () => null }),
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/portal/auth/forgot-password',
      payload: { email: 'unknown@example.com' },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('PORTAL_ACCOUNT_NOT_FOUND');
    expect(body.error.message).toContain('Aucun dossier patient');
  });

  it('rejects with STAFF_ACCOUNT_DETECTED when a clinic staff email is entered', async () => {
    vi.spyOn(portalRepository, 'findUserByEmail').mockResolvedValue(null);
    vi.spyOn(userRepository, 'findByEmail').mockResolvedValue({
      _id: new Types.ObjectId(),
      email: 'doctor@clinic.com',
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/portal/auth/forgot-password',
      payload: { email: 'doctor@clinic.com' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('STAFF_ACCOUNT_DETECTED');
  });

  it('re-sends activation invitation when guardian exists without an active portal user', async () => {
    const clinicId = new Types.ObjectId().toString();
    const guardianId = new Types.ObjectId().toString();

    vi.spyOn(portalRepository, 'findUserByEmail').mockResolvedValue(null);
    vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);
    vi.spyOn(GuardianModel, 'findOne').mockReturnValue({
      lean: () => ({
        exec: async () => ({
          _id: new Types.ObjectId(guardianId),
          clinicId: new Types.ObjectId(clinicId),
          firstName: 'Marie',
          lastName: 'Dupont',
          email: 'marie.dupont@example.com',
        }),
      }),
    } as any);
    vi.spyOn(clinicRepository, 'findById').mockResolvedValue({
      _id: new Types.ObjectId(clinicId),
      name: 'Cabinet Ortho Paris',
    } as any);
    vi.spyOn(portalRepository, 'createInvitation').mockResolvedValue({} as any);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/portal/auth/forgot-password',
      payload: { email: 'marie.dupont@example.com' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.message).toContain('pas encore activé');
  });
});

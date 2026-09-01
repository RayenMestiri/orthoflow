import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { ERROR_CODES } from '../../src/common/constants/error-codes.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { PortalAuthService } from '../../src/modules/portal/portal-auth.service.js';
import { GuardianService } from '../../src/modules/guardians/guardian.service.js';

describe('Smart Login & Email Uniqueness', () => {
  const context = {
    ip: '127.0.0.1',
    userAgent: 'test-agent',
    now: new Date(),
  };

  describe('AuthService.login smart detection', () => {
    it('throws PORTAL_ACCOUNT_DETECTED when the email belongs to a Family Portal user', async () => {
      const users = { findByEmailForAuthentication: vi.fn().mockResolvedValue(null) };
      const portal = {
        findUserByEmail: vi.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          email: 'parent@example.com',
        }),
      };
      const authService = new AuthService(
        users as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        portal as never,
      );

      await expect(
        authService.login({ email: 'parent@example.com', password: 'Password123!' }, context),
      ).rejects.toMatchObject({
        code: ERROR_CODES.PORTAL_ACCOUNT_DETECTED,
      });
    });
  });

  describe('PortalAuthService.login smart detection', () => {
    it('throws STAFF_ACCOUNT_DETECTED when the email belongs to a clinic staff user', async () => {
      const portalService = new PortalAuthService();
      const portalRepo = await import('../../src/modules/portal/portal.repository.js');
      const userRepo = await import('../../src/modules/users/user.repository.js');

      vi.spyOn(portalRepo.portalRepository, 'findUserByEmail').mockResolvedValue(null);
      vi.spyOn(userRepo.userRepository, 'findByEmail').mockResolvedValue({
        _id: new Types.ObjectId(),
        email: 'staff@clinic.com',
      } as never);

      await expect(
        portalService.login('staff@clinic.com', 'Password123!', context as never),
      ).rejects.toMatchObject({
        code: ERROR_CODES.STAFF_ACCOUNT_DETECTED,
      });
    });
  });

  describe('GuardianService email uniqueness', () => {
    const clinicId = new Types.ObjectId().toString();
    const patientId = new Types.ObjectId().toString();
    const mutationContext = {
      clinicId,
      actorUserId: new Types.ObjectId().toString(),
      ip: '127.0.0.1',
      userAgent: 'test',
      now: new Date(),
    };

    it('rejects creating a guardian with an email that belongs to a clinic staff user', async () => {
      const patients = { findByIdInClinic: vi.fn().mockResolvedValue({ _id: patientId }) };
      const users = { findByEmail: vi.fn().mockResolvedValue({ _id: new Types.ObjectId(), email: 'owner@clinic.com' }) };
      const guardians = { findByEmailInClinic: vi.fn().mockResolvedValue(null) };
      const service = new GuardianService(patients as never, guardians as never, {} as never, {} as never, users as never);

      await expect(
        service.createForPatient(clinicId, patientId, {
          firstName: 'Jean',
          lastName: 'Dupont',
          email: 'owner@clinic.com',
          relationship: 'FATHER',
        }, mutationContext),
      ).rejects.toMatchObject({
        code: ERROR_CODES.EMAIL_ALREADY_REGISTERED,
      });
    });

    it('rejects creating a guardian with an email that already exists in the same clinic', async () => {
      const patients = { findByIdInClinic: vi.fn().mockResolvedValue({ _id: patientId }) };
      const users = { findByEmail: vi.fn().mockResolvedValue(null) };
      const guardians = { findByEmailInClinic: vi.fn().mockResolvedValue({ _id: new Types.ObjectId(), email: 'existing@parent.com' }) };
      const service = new GuardianService(patients as never, guardians as never, {} as never, {} as never, users as never);

      await expect(
        service.createForPatient(clinicId, patientId, {
          firstName: 'Marie',
          lastName: 'Dupont',
          email: 'existing@parent.com',
          relationship: 'MOTHER',
        }, mutationContext),
      ).rejects.toMatchObject({
        code: ERROR_CODES.EMAIL_ALREADY_REGISTERED,
      });
    });
  });
});

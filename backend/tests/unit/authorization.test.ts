import { describe, expect, it } from 'vitest';
import {
  assertPermissions,
  buildTenantContext,
  hasPermission,
  resolveClinicRole,
} from '../../src/common/authorization/policy.js';
import { PERMISSIONS } from '../../src/common/constants/permissions.js';
import {
  CLINIC_ROLES,
  MEMBERSHIP_STATUSES,
  PLATFORM_ROLES,
} from '../../src/common/constants/roles.js';
import { ForbiddenError } from '../../src/common/errors/app-error.js';
import type { AuthenticatedUser } from '../../src/common/types/auth.types.js';

const CLINIC_A = '652f1c9b8a1e4f0012ab34cd';
const CLINIC_B = '652f1c9b8a1e4f0012ab99ff';

function buildUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: '652f1c9b8a1e4f0012ab0001',
    email: 'amine@clinic.tn',
    firstName: 'Amine',
    lastName: 'Ben Salah',
    platformRole: PLATFORM_ROLES.USER,
    sessionId: '652f1c9b8a1e4f0012ab0002',
    memberships: [
      {
        clinicId: CLINIC_A,
        role: CLINIC_ROLES.SECRETARY,
        status: MEMBERSHIP_STATUSES.ACTIVE,
      },
    ],
    ...overrides,
  };
}

describe('resolveClinicRole', () => {
  it('returns the role for an active membership', () => {
    expect(resolveClinicRole(buildUser(), CLINIC_A)).toBe(CLINIC_ROLES.SECRETARY);
  });

  it('ignores a membership that is not ACTIVE', () => {
    const suspended = buildUser({
      memberships: [
        { clinicId: CLINIC_A, role: CLINIC_ROLES.DENTIST, status: MEMBERSHIP_STATUSES.SUSPENDED },
      ],
    });

    expect(resolveClinicRole(suspended, CLINIC_A)).toBeNull();
  });
});

describe('buildTenantContext', () => {
  it('scopes the request to a clinic the caller actually belongs to', () => {
    const tenant = buildTenantContext(buildUser(), CLINIC_A);

    expect(tenant).toEqual({
      clinicId: CLINIC_A,
      role: CLINIC_ROLES.SECRETARY,
      isPlatformAdmin: false,
    });
  });

  it('refuses a clinic the caller has no membership in', () => {
    expect(() => buildTenantContext(buildUser(), CLINIC_B)).toThrow(ForbiddenError);
  });

  it('refuses a clinic whose membership is suspended', () => {
    const suspended = buildUser({
      memberships: [
        { clinicId: CLINIC_A, role: CLINIC_ROLES.SECRETARY, status: MEMBERSHIP_STATUSES.SUSPENDED },
      ],
    });

    expect(() => buildTenantContext(suspended, CLINIC_A)).toThrow(ForbiddenError);
  });

  it('lets a platform admin act in a clinic they are not a member of', () => {
    const admin = buildUser({ platformRole: PLATFORM_ROLES.SUPER_ADMIN, memberships: [] });
    const tenant = buildTenantContext(admin, CLINIC_B);

    expect(tenant).toEqual({ clinicId: CLINIC_B, role: null, isPlatformAdmin: true });
  });
});

describe('permissions', () => {
  it('grants a clinic owner every permission', () => {
    const tenant = buildTenantContext(
      buildUser({
        memberships: [
          {
            clinicId: CLINIC_A,
            role: CLINIC_ROLES.CLINIC_OWNER,
            status: MEMBERSHIP_STATUSES.ACTIVE,
          },
        ],
      }),
      CLINIC_A,
    );

    for (const permission of Object.values(PERMISSIONS)) {
      expect(hasPermission(tenant, permission)).toBe(true);
    }
  });

  it('lets a secretary manage patients but not read the audit trail', () => {
    const tenant = buildTenantContext(buildUser(), CLINIC_A);

    expect(hasPermission(tenant, PERMISSIONS.PATIENT_CREATE)).toBe(true);
    expect(hasPermission(tenant, PERMISSIONS.AUDIT_LOG_READ)).toBe(false);
    expect(hasPermission(tenant, PERMISSIONS.PATIENT_ARCHIVE)).toBe(false);
    expect(hasPermission(tenant, PERMISSIONS.GENERATED_DOCUMENT_GENERATE_ADMINISTRATIVE)).toBe(true);
    expect(hasPermission(tenant, PERMISSIONS.GENERATED_DOCUMENT_GENERATE_FINANCIAL)).toBe(true);
    expect(hasPermission(tenant, PERMISSIONS.GENERATED_DOCUMENT_GENERATE_CLINICAL)).toBe(false);
    expect(hasPermission(tenant, PERMISSIONS.GENERATED_DOCUMENT_VOID)).toBe(false);
  });

  it('limits an assistant to read-only access', () => {
    const tenant = buildTenantContext(
      buildUser({
        memberships: [
          { clinicId: CLINIC_A, role: CLINIC_ROLES.ASSISTANT, status: MEMBERSHIP_STATUSES.ACTIVE },
        ],
      }),
      CLINIC_A,
    );

    expect(hasPermission(tenant, PERMISSIONS.PATIENT_READ)).toBe(true);
    expect(hasPermission(tenant, PERMISSIONS.PATIENT_CREATE)).toBe(false);
    expect(hasPermission(tenant, PERMISSIONS.MEMBERSHIP_CREATE)).toBe(false);
  });

  it('keeps clinical visit notes away from the front desk and owner-only after sign-off', () => {
    const secretary = buildTenantContext(buildUser(), CLINIC_A);
    expect(hasPermission(secretary, PERMISSIONS.CLINICAL_VISIT_READ)).toBe(false);
    expect(hasPermission(secretary, PERMISSIONS.CLINICAL_VISIT_MANAGE)).toBe(false);

    const dentist = buildTenantContext(
      buildUser({
        memberships: [
          { clinicId: CLINIC_A, role: CLINIC_ROLES.DENTIST, status: MEMBERSHIP_STATUSES.ACTIVE },
        ],
      }),
      CLINIC_A,
    );
    expect(hasPermission(dentist, PERMISSIONS.CLINICAL_VISIT_READ)).toBe(true);
    expect(hasPermission(dentist, PERMISSIONS.CLINICAL_VISIT_MANAGE)).toBe(true);
    expect(hasPermission(dentist, PERMISSIONS.CLINICAL_VISIT_EDIT_COMPLETED)).toBe(false);
  });

  it('reports every missing permission in the error details', () => {
    const tenant = buildTenantContext(buildUser(), CLINIC_A);

    try {
      assertPermissions(tenant, [PERMISSIONS.PATIENT_READ, PERMISSIONS.AUDIT_LOG_READ]);
      expect.unreachable('assertPermissions should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).details).toEqual({
        required: [PERMISSIONS.AUDIT_LOG_READ],
        role: CLINIC_ROLES.SECRETARY,
      });
    }
  });
});

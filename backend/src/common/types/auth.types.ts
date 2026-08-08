import type { ClinicRole, MembershipStatus, PlatformRole } from '../constants/roles.js';

/**
 * A clinic the authenticated user belongs to, as resolved from the database.
 *
 * Kept intentionally minimal — this is rebuilt on every request, so it must not
 * require joining the clinics collection. Endpoints that need clinic details
 * (`GET /auth/me`) load them separately.
 */
export interface AuthenticatedMembership {
  clinicId: string;
  role: ClinicRole;
  status: MembershipStatus;
}

/**
 * The trusted identity of the caller.
 *
 * Rebuilt from the database on every request — never reconstructed from the
 * JWT body — so that a revoked membership or a role change takes effect
 * immediately instead of at the next token expiry.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  platformRole: PlatformRole;
  /** Auth session this access token belongs to. */
  sessionId: string;
  memberships: AuthenticatedMembership[];
}

/**
 * The clinic the current request operates on, plus the caller's role in it.
 *
 * Always produced by the server from the caller's memberships. A `clinicId`
 * present in a request body is data, never authority.
 */
export interface TenantContext {
  clinicId: string;
  /** `null` only for a SUPER_ADMIN acting outside their own memberships. */
  role: ClinicRole | null;
  isPlatformAdmin: boolean;
}

export const TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh',
} as const;

export type TokenType = (typeof TOKEN_TYPES)[keyof typeof TOKEN_TYPES];

/** Access token claims. Deliberately tiny: identity lives in the database. */
export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  /** Auth session id, so a logout invalidates in-flight access tokens too. */
  sid: string;
  typ: typeof TOKEN_TYPES.ACCESS;
}

/** Refresh token claims. `fid` groups rotated tokens into one family. */
export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  /** Token family id — used to detect and contain refresh-token replay. */
  fid: string;
  typ: typeof TOKEN_TYPES.REFRESH;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds, for client-side scheduling. */
  expiresIn: number;
}

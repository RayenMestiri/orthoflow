/** Versioned base path. Breaking changes get `/api/v2`, never a silent rewrite. */
export const API_PREFIX = '/api/v1';

/** Header a multi-clinic client uses to declare which practice it is working in. */
export const CLINIC_HEADER = 'x-clinic-id';

/**
 * httpOnly cookie carrying the refresh token for browser clients, so the token
 * is unreachable from JavaScript and therefore from XSS.
 */
export const REFRESH_COOKIE_NAME = 'orthoflow_refresh_token';

export const REFRESH_COOKIE_PATH = `${API_PREFIX}/auth`;

export const PORTAL_REFRESH_COOKIE_NAME = 'orthoflow_portal_refresh_token';
export const PORTAL_REFRESH_COOKIE_PATH = `${API_PREFIX}/portal/auth`;

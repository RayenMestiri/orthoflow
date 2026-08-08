import { ERROR_CODES, type ErrorCode } from '../constants/error-codes.js';

/** Extra machine-readable context attached to an error response. */
export type ErrorDetails = Record<string, unknown> | unknown[];

export interface AppErrorOptions {
  /** Stable code returned to the client. Defaults per error subclass. */
  code?: ErrorCode;
  /** Safe, non-sensitive context (e.g. field-level validation issues). */
  details?: ErrorDetails;
  /** Original error, logged but never serialized to the client. */
  cause?: unknown;
}

/**
 * Base class for every error the API raises deliberately.
 *
 * `AppError`s are *operational*: they describe an expected outcome (not found,
 * forbidden, conflicting state) and their message is safe to show to a client.
 * Anything that is not an `AppError` is treated as a bug, logged with its stack
 * and reported as a generic 500 — stack traces never leave the server.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details: ErrorDetails | undefined;
  public readonly isOperational = true;

  constructor(statusCode: number, code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = options.code ?? code;
    this.details = options.details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** 400 — the request payload is structurally or semantically invalid. */
export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', options: AppErrorOptions = {}) {
    super(400, ERROR_CODES.VALIDATION_ERROR, message, options);
  }
}

/** 401 — the caller could not be authenticated. */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', options: AppErrorOptions = {}) {
    super(401, ERROR_CODES.UNAUTHORIZED, message, options);
  }
}

/** 403 — the caller is known but not allowed to perform this action here. */
export class ForbiddenError extends AppError {
  constructor(
    message = 'You are not allowed to perform this action',
    options: AppErrorOptions = {},
  ) {
    super(403, ERROR_CODES.FORBIDDEN, message, options);
  }
}

/** 404 — the resource does not exist, or is invisible to this tenant. */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', options: AppErrorOptions = {}) {
    super(404, ERROR_CODES.NOT_FOUND, message, options);
  }
}

/** 409 — the request conflicts with the current state (duplicate, race). */
export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', options: AppErrorOptions = {}) {
    super(409, ERROR_CODES.CONFLICT, message, options);
  }
}

/** 422 — well-formed request rejected by a domain invariant. */
export class BusinessRuleError extends AppError {
  constructor(message = 'Operation violates a business rule', options: AppErrorOptions = {}) {
    super(422, ERROR_CODES.BUSINESS_RULE_VIOLATION, message, options);
  }
}

/** 429 — too many requests. */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', options: AppErrorOptions = {}) {
    super(429, ERROR_CODES.RATE_LIMITED, message, options);
  }
}

/** 503 — a required downstream dependency is unavailable. */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', options: AppErrorOptions = {}) {
    super(503, ERROR_CODES.SERVICE_UNAVAILABLE, message, options);
  }
}

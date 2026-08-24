import fp from 'fastify-plugin';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { isProduction } from '../config/env.js';
import { ERROR_CODES, type ErrorCode } from '../common/constants/error-codes.js';
import { AppError, type ErrorDetails } from '../common/errors/app-error.js';
import { failure } from '../common/utils/response.js';

interface NormalizedError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetails;
}

interface MongoDuplicateKeyError {
  code: number;
  keyPattern?: Record<string, unknown>;
}

function isMongoDuplicateKeyError(error: unknown): error is MongoDuplicateKeyError {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

/**
 * Pulls the human message out of a Zod issue carried by a Fastify validation
 * error. Fastify types `params` as an open record, so the shape is checked
 * rather than asserted.
 */
function readIssueMessage(issue: { message?: string; params: Record<string, unknown> }): string {
  const inner = issue.params.issue;
  if (typeof inner === 'object' && inner !== null && 'message' in inner) {
    const message = (inner as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return issue.message ?? 'Invalid value';
}

function isMongooseCastError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'CastError'
  );
}

/**
 * Turns anything thrown anywhere in the request lifecycle into the single error
 * envelope documented in the README.
 *
 * This is why controllers contain no `try/catch`: a handler throws a typed
 * `AppError` (or lets an infrastructure error bubble), and exactly one place
 * decides the status code, the log level and what the client is allowed to see.
 */
function normalize(error: FastifyError, request: FastifyRequest): NormalizedError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    return {
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Request validation failed',
      details: {
        target: error.validationContext ?? 'body',
        issues: error.validation.map((issue) => ({
          path: issue.instancePath.replace(/^\//, '') || '(root)',
          message: readIssueMessage(issue),
        })),
      },
    };
  }

  if (isResponseSerializationError(error)) {
    // A handler returned something its response schema does not allow. That is
    // our bug, and the details would describe internal shapes — log, hide.
    request.log.error(
      { err: error, route: request.routeOptions.url },
      'Response serialization failed',
    );
    return {
      statusCode: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Internal server error',
    };
  }

  if (isMongoDuplicateKeyError(error)) {
    const fields = Object.keys(error.keyPattern ?? {});
    return {
      statusCode: 409,
      code: ERROR_CODES.CONFLICT,
      message: 'A record with these values already exists',
      ...(fields.length > 0 ? { details: { fields } } : {}),
    };
  }

  if (isMongooseCastError(error)) {
    return {
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Malformed identifier in request',
    };
  }

  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return {
      statusCode: 413,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      message: 'Request body is too large',
    };
  }

  if (error.statusCode === 429) {
    return {
      statusCode: 429,
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many requests. Please slow down.',
    };
  }

  // Fastify's own 4xx (bad JSON, unsupported media type) are safe to surface.
  if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
    return {
      statusCode: error.statusCode,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: error.message,
    };
  }

  return {
    statusCode: 500,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'Internal server error',
  };
}

export const errorHandlerPlugin = fp(
  async (app) => {
    app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      const normalized = normalize(error, request);

      if (normalized.statusCode >= 500) {
        // Unexpected: keep the stack, we need it to fix the bug.
        request.log.error({ err: error }, 'Unhandled server error');
      } else {
        // Expected: one compact line, no stack, no payload echo.
        request.log.warn(
          { code: normalized.code, statusCode: normalized.statusCode },
          normalized.message,
        );
      }

      const body = failure(normalized.code, normalized.message, {
        ...normalized.details,
        requestId: request.id,
      });

      // Stack traces are never serialized. In development the full error is
      // still in the logs, which is where a developer should be looking.
      if (!isProduction && normalized.statusCode >= 500) {
        request.log.debug({ stack: error.stack }, 'Error stack');
      }

      return reply.status(normalized.statusCode).send(body);
    });

    app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
      return reply.status(404).send(
        failure(ERROR_CODES.NOT_FOUND, `Route ${request.method} ${request.url} does not exist`, {
          requestId: request.id,
        }),
      );
    });
  },
  { name: 'error-handler-plugin' },
);

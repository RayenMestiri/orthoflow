import { z } from 'zod';

/**
 * Reusable response envelopes.
 *
 * These are the *documented* contract (OpenAPI) and the *enforced* contract:
 * `fastify-type-provider-zod` serializes replies through them, so a handler that
 * accidentally returns a Mongoose document with a `passwordHash` cannot leak it.
 */

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().meta({ description: 'Stable machine-readable error code' }),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  pages: z.number().int().min(0),
});

export function successSchema<T extends z.ZodType>(data: T) {
  return z.object({ success: z.literal(true), data });
}

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(item),
    pagination: paginationMetaSchema,
  });
}

/** Response body for endpoints that succeed without returning a resource. */
export const acknowledgedSchema = successSchema(z.object({ acknowledged: z.literal(true) }));

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Validation failed',
  401: 'Authentication required or token invalid',
  403: 'Authenticated but not allowed in this clinic',
  404: 'Resource not found',
  409: 'Conflicts with existing state',
  422: 'Rejected by a business rule',
  429: 'Rate limit exceeded',
  500: 'Unexpected server error',
};

/**
 * Declares the documented error responses for a route.
 * Usage: `response: { 200: ..., ...errorResponses(401, 403, 404) }`
 */
export function errorResponses(...statusCodes: number[]): Record<number, z.ZodType> {
  const responses: Record<number, z.ZodType> = {};
  for (const status of statusCodes) {
    responses[status] = errorResponseSchema.meta({
      description: ERROR_DESCRIPTIONS[status] ?? 'Error',
    });
  }
  return responses;
}

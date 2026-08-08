import type { ErrorCode } from '../constants/error-codes.js';
import type { ErrorDetails } from '../errors/app-error.js';
import type { PaginatedResult, PaginationMeta, PaginationParams } from '../types/common.types.js';
import { buildPaginationMeta } from './pagination.js';

/**
 * Every response the API produces uses one of these three envelopes. Clients can
 * therefore branch on `success` alone, without per-endpoint special cases.
 */

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
  };
}

export function ok<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}

export function paginated<T>(
  result: PaginatedResult<T>,
  params: PaginationParams,
): PaginatedResponse<T> {
  return {
    success: true,
    data: result.items,
    pagination: buildPaginationMeta(params, result.total),
  };
}

export function failure(code: ErrorCode, message: string, details?: ErrorDetails): ErrorResponse {
  return {
    success: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}

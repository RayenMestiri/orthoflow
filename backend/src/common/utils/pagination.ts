import type { PaginationMeta, PaginationParams } from '../types/common.types.js';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
/** Hard ceiling — no client may ask the database for an unbounded result set. */
export const MAX_PAGE_SIZE = 100;

/**
 * Clamps raw pagination input into safe bounds.
 *
 * Every list query in the codebase goes through this so that a hostile or buggy
 * client cannot turn a listing endpoint into a full-collection scan.
 */
export function toPaginationParams(
  input: { page?: number; limit?: number } = {},
): PaginationParams {
  const page = Math.max(DEFAULT_PAGE, Math.trunc(input.page ?? DEFAULT_PAGE));
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(input.limit ?? DEFAULT_PAGE_SIZE)));

  return { page, limit, skip: (page - 1) * limit };
}

export function buildPaginationMeta(params: PaginationParams, total: number): PaginationMeta {
  return {
    page: params.page,
    limit: params.limit,
    total,
    pages: params.limit > 0 ? Math.ceil(total / params.limit) : 0,
  };
}

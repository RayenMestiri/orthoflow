/** Normalized pagination input, already clamped to safe bounds. */
export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

/** Pagination block returned alongside every list response. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** What a repository returns for a paginated query. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

export type SortDirection = 'asc' | 'desc';

/** Recursively marks a type readonly — handy for frozen config objects. */
export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

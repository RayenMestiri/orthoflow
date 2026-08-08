/**
 * Escapes regex metacharacters so a user-supplied search term is matched
 * literally. Without this, a term like `.*` degenerates into a full scan and
 * `(((((` throws a catastrophic-backtracking error from the server.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "starts with / contains" matcher for list filters. */
export function containsInsensitive(value: string): { $regex: string; $options: string } {
  return { $regex: escapeRegex(value), $options: 'i' };
}

/** Common Mongoose read options: never hydrate documents we only serialize. */
export const LEAN_READ = { lean: true } as const;

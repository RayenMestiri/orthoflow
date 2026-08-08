const UNIT_SECONDS: Record<string, number> = {
  ms: 0.001,
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  y: 31_536_000,
};

const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d|w|y)$/;

/**
 * Converts a human duration such as `15m` or `30d` into whole seconds.
 *
 * We resolve durations ourselves rather than handing the raw string to
 * `jsonwebtoken`, so the token TTL is a plain number we can also return to
 * clients (`expiresIn`) and assert on in tests.
 */
export function parseDurationToSeconds(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: "${value}". Expected something like 15m, 2h or 30d.`);
  }

  const [, amount, unit] = match;
  const seconds = Number(amount) * (UNIT_SECONDS[unit as string] ?? 0);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Invalid duration: "${value}". Must resolve to a positive number of seconds.`);
  }

  return Math.round(seconds);
}

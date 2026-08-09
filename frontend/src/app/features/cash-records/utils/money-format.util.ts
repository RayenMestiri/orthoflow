/**
 * Money formatting for display.
 *
 * The backend is authoritative for every amount; this file exists so the UI can
 * render a figure the user recognizes and validate what they type *before*
 * sending it. It mirrors `backend/src/common/utils/money.ts` deliberately — the
 * same string-based arithmetic, so the client never disagrees with the server
 * about what `150.5` means.
 */

const MINOR_UNIT_EXPONENTS: Readonly<Record<string, number>> = {
  TND: 3,
  LYD: 3,
  DZD: 2,
  MAD: 2,
  EUR: 2,
  USD: 2,
  GBP: 2,
  CHF: 2,
};

const DEFAULT_EXPONENT = 2;

export function minorUnitExponent(currency: string): number {
  return MINOR_UNIT_EXPONENTS[currency.toUpperCase()] ?? DEFAULT_EXPONENT;
}

/**
 * Minor units to a major-unit string: `200000` in TND becomes `'200.000'`.
 *
 * String arithmetic, not division — `1 / 1000` is fine but `123456789 / 1000`
 * starts producing figures a clinic would query.
 */
export function formatMinor(amountMinor: number, currency: string): string {
  const exponent = minorUnitExponent(currency);
  const negative = amountMinor < 0;
  const digits = Math.abs(Math.round(amountMinor))
    .toString()
    .padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = exponent === 0 ? '' : `.${digits.slice(digits.length - exponent)}`;
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

/** `200000` in TND becomes `'200.000 TND'` — the form used across the UI. */
export function formatMoney(amountMinor: number, currency: string): string {
  return `${formatMinor(amountMinor, currency)} ${currency.toUpperCase()}`;
}

export interface AmountParseResult {
  /** Integer minor units, or null when the input is not a usable amount. */
  amountMinor: number | null;
  /** A message to show under the field, or null when the input is fine. */
  error: string | null;
}

/**
 * Validates and converts what the user typed.
 *
 * Accepts `150`, `150.5`, `150.750` and a comma separator. Rejects anything
 * else rather than guessing — an amount silently reinterpreted is exactly the
 * kind of surprise this feature exists to prevent.
 */
export function parseAmount(raw: string, currency: string): AmountParseResult {
  const exponent = minorUnitExponent(currency);
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { amountMinor: null, error: 'Enter the amount received.' };
  }

  const match = /^(\d+)(?:[.,](\d+))?$/.exec(trimmed);
  if (!match) {
    return {
      amountMinor: null,
      error: `Enter an amount such as 150 or 150.${'7'.padEnd(exponent, '5')}.`,
    };
  }

  const [, whole = '0', fraction = ''] = match;

  if (fraction.length > exponent) {
    return {
      amountMinor: null,
      error: `${currency.toUpperCase()} amounts have at most ${exponent} decimal places.`,
    };
  }

  const amountMinor = Number(`${whole}${fraction.padEnd(exponent, '0')}`);

  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return { amountMinor: null, error: 'The amount must be greater than zero.' };
  }

  return { amountMinor, error: null };
}

/**
 * A per-submission id.
 *
 * Generated once when the drawer opens, so an impatient double-click reuses it
 * and the backend returns the first record instead of creating a second.
 * `crypto.randomUUID` is available in every browser this app supports; the
 * fallback keeps unit tests and older WebViews working.
 */
export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

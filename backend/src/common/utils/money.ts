import { ERROR_CODES } from '../constants/error-codes.js';
import { ValidationError } from '../errors/app-error.js';

/**
 * Money handling for OrthoFlow.
 *
 * THE RULE: money is stored and computed as an integer count of *minor units*.
 * Never as a JavaScript number of dinars. `0.1 + 0.2 !== 0.3` is a curiosity in
 * a blog post and a dispute with a patient's parent in a clinic.
 *
 * Tunisia uses three decimal places — 1 TND = 1000 millimes — so `200.000 TND`
 * is stored as `200000`. Two-decimal currencies work the same way with a
 * different exponent, which is why the exponent is looked up rather than
 * assumed.
 */

/** Fallback when a clinic predates the `currency` field. See AGENTS.md §7. */
export const DEFAULT_CURRENCY = 'TND';

/**
 * ISO-4217 minor-unit exponents for the currencies OrthoFlow supports.
 *
 * Deliberately a short list: an unknown currency is rejected rather than
 * silently assumed to have two decimals, because guessing wrong here means
 * every amount in that clinic is out by a factor of ten.
 */
const MINOR_UNIT_EXPONENTS: Readonly<Record<string, number>> = {
  TND: 3, // Tunisian dinar — millimes
  LYD: 3, // Libyan dinar
  DZD: 2,
  MAD: 2,
  EUR: 2,
  USD: 2,
  GBP: 2,
  CHF: 2,
};

export const SUPPORTED_CURRENCIES = Object.keys(MINOR_UNIT_EXPONENTS);

/** Guard rail: no single recorded payment may exceed one million major units. */
const MAX_MAJOR_UNITS = 1_000_000;

export function isSupportedCurrency(currency: string): boolean {
  return currency.toUpperCase() in MINOR_UNIT_EXPONENTS;
}

export function minorUnitExponent(currency: string): number {
  const exponent = MINOR_UNIT_EXPONENTS[currency.toUpperCase()];
  if (exponent === undefined) {
    throw new ValidationError(`Unsupported currency: ${currency}`, {
      code: ERROR_CODES.UNSUPPORTED_CURRENCY,
      details: { currency, supported: SUPPORTED_CURRENCIES },
    });
  }
  return exponent;
}

/**
 * Parses a human-typed amount into minor units.
 *
 * Works on the *string*, not on a float: `'150.750'` becomes `150750` by
 * padding the fractional digits, never by multiplying by 1000 and hoping the
 * binary representation rounds the way we want.
 *
 * Accepts `'150'`, `'150.5'`, `'150.750'` and a comma decimal separator, since
 * that is what a French-locale keyboard produces in Tunisia.
 */
export function parseAmountToMinor(input: string | number, currency: string): number {
  const exponent = minorUnitExponent(currency);
  const raw = typeof input === 'number' ? formatNumberForParsing(input) : input.trim();

  if (raw.length === 0) {
    throw invalidAmount('An amount is required');
  }

  const normalized = raw.replace(',', '.');
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) {
    throw invalidAmount('Enter a positive amount, for example 150.750');
  }

  const [, whole = '0', fraction = ''] = match;

  // More decimals than the currency has is not a rounding opportunity: the
  // caller meant something we cannot represent, so say so instead of truncating.
  if (fraction.length > exponent) {
    throw invalidAmount(
      exponent === 0
        ? `${currency} amounts have no decimal places`
        : `${currency} amounts have at most ${exponent} decimal places`,
    );
  }

  const minor = Number(`${whole}${fraction.padEnd(exponent, '0')}`);

  if (!Number.isSafeInteger(minor)) {
    throw invalidAmount('That amount is too large to record');
  }
  if (minor <= 0) {
    throw invalidAmount('The amount must be greater than zero');
  }
  if (minor > MAX_MAJOR_UNITS * 10 ** exponent) {
    throw invalidAmount('That amount is too large to record');
  }

  return minor;
}

/**
 * Converts a legacy major-unit decimal (such as `treatment.agreedPrice`) into
 * minor units.
 *
 * FUTURE NORMALIZATION POINT — `treatment.agreedPrice` is a floating-point
 * number of dinars, which predates this module. Converting here keeps the
 * conversion in exactly one place, and rounding is explicit rather than
 * emergent. When Treatment migrates to `agreedPriceMinor`, delete this function
 * and read the field directly; nothing else needs to change.
 */
export function majorToMinor(value: number, currency: string): number {
  const exponent = minorUnitExponent(currency);
  if (!Number.isFinite(value) || value < 0) {
    throw invalidAmount('The agreed price is not a usable amount');
  }
  // toFixed before rounding: 3.605 * 100 is 360.49999999999994 in binary
  // floating point, and rounding that gives the wrong millime.
  return Math.round(Number(value.toFixed(exponent)) * 10 ** exponent);
}

/** Minor units back to a major-unit decimal string, e.g. `200000` → `'200.000'`. */
export function formatMinor(amountMinor: number, currency: string): string {
  const exponent = minorUnitExponent(currency);
  const negative = amountMinor < 0;
  const digits = Math.abs(amountMinor)
    .toString()
    .padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = exponent === 0 ? '' : `.${digits.slice(digits.length - exponent)}`;
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

function formatNumberForParsing(value: number): string {
  if (!Number.isFinite(value)) {
    throw invalidAmount('Enter a positive amount, for example 150.750');
  }
  // A JSON number reaches us as a float; render it without exponent notation so
  // the string parser above sees the digits the caller actually typed.
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function invalidAmount(message: string): ValidationError {
  return new ValidationError(message, { code: ERROR_CODES.INVALID_AMOUNT });
}

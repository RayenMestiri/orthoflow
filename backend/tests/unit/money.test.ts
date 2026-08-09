import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/common/constants/error-codes.js';
import { AppError } from '../../src/common/errors/app-error.js';
import {
  DEFAULT_CURRENCY,
  formatMinor,
  isSupportedCurrency,
  majorToMinor,
  minorUnitExponent,
  parseAmountToMinor,
} from '../../src/common/utils/money.js';

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.unreachable(`should have thrown ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
}

describe('money', () => {
  describe('currencies', () => {
    it('treats the Tunisian dinar as a three-decimal currency', () => {
      expect(minorUnitExponent('TND')).toBe(3);
      expect(DEFAULT_CURRENCY).toBe('TND');
    });

    it('keeps two-decimal currencies at two', () => {
      expect(minorUnitExponent('EUR')).toBe(2);
      expect(minorUnitExponent('usd')).toBe(2);
    });

    it('rejects an unknown currency rather than guessing its exponent', () => {
      expect(isSupportedCurrency('XXX')).toBe(false);
      expectCode(() => minorUnitExponent('XXX'), ERROR_CODES.UNSUPPORTED_CURRENCY);
    });
  });

  describe('parseAmountToMinor', () => {
    it('converts whole dinars to millimes', () => {
      expect(parseAmountToMinor('200', 'TND')).toBe(200_000);
    });

    it('pads a short fraction to the currency exponent', () => {
      // '150.5' is 150 dinars 500 millimes, not 150 dinars 5 millimes.
      expect(parseAmountToMinor('150.5', 'TND')).toBe(150_500);
      expect(parseAmountToMinor('150.75', 'TND')).toBe(150_750);
      expect(parseAmountToMinor('150.750', 'TND')).toBe(150_750);
    });

    it('accepts a comma decimal separator, which is what a French keyboard types', () => {
      expect(parseAmountToMinor('150,750', 'TND')).toBe(150_750);
    });

    it('never loses a millime to binary floating point', () => {
      // 3.605 * 1000 is 3604.9999999999995 as a double. String parsing is exact.
      expect(parseAmountToMinor('3.605', 'TND')).toBe(3605);
      expect(parseAmountToMinor('0.001', 'TND')).toBe(1);
      expect(parseAmountToMinor('1.1', 'EUR')).toBe(110);
      expect(parseAmountToMinor('0.29', 'EUR')).toBe(29);
    });

    it('rejects zero and negative amounts', () => {
      expectCode(() => parseAmountToMinor('0', 'TND'), ERROR_CODES.INVALID_AMOUNT);
      expectCode(() => parseAmountToMinor('0.000', 'TND'), ERROR_CODES.INVALID_AMOUNT);
      expectCode(() => parseAmountToMinor('-50', 'TND'), ERROR_CODES.INVALID_AMOUNT);
    });

    it('rejects more decimals than the currency has', () => {
      // Refusing beats silently truncating a figure the clinic actually typed.
      expectCode(() => parseAmountToMinor('1.2345', 'TND'), ERROR_CODES.INVALID_AMOUNT);
      expectCode(() => parseAmountToMinor('1.234', 'EUR'), ERROR_CODES.INVALID_AMOUNT);
    });

    it('rejects text and empty input', () => {
      expectCode(() => parseAmountToMinor('', 'TND'), ERROR_CODES.INVALID_AMOUNT);
      expectCode(() => parseAmountToMinor('abc', 'TND'), ERROR_CODES.INVALID_AMOUNT);
      expectCode(() => parseAmountToMinor('1e3', 'TND'), ERROR_CODES.INVALID_AMOUNT);
    });

    it('rejects an implausibly large amount', () => {
      expectCode(() => parseAmountToMinor('9999999999', 'TND'), ERROR_CODES.INVALID_AMOUNT);
    });

    it('accepts a JSON number for tolerance', () => {
      expect(parseAmountToMinor(200, 'TND')).toBe(200_000);
      expect(parseAmountToMinor(150.75, 'TND')).toBe(150_750);
    });
  });

  describe('formatMinor', () => {
    it('renders millimes as a three-decimal dinar figure', () => {
      expect(formatMinor(200_000, 'TND')).toBe('200.000');
      expect(formatMinor(150_750, 'TND')).toBe('150.750');
      expect(formatMinor(1, 'TND')).toBe('0.001');
      expect(formatMinor(0, 'TND')).toBe('0.000');
    });

    it('round-trips every parse', () => {
      for (const amount of ['200.000', '150.750', '0.001', '3.605', '12345.678']) {
        expect(formatMinor(parseAmountToMinor(amount, 'TND'), 'TND')).toBe(amount);
      }
    });

    it('handles a negative difference, as a remaining balance may be', () => {
      expect(formatMinor(-50_000, 'TND')).toBe('-50.000');
    });
  });

  describe('majorToMinor', () => {
    it('converts a legacy decimal agreed price without drift', () => {
      // This is the Treatment `agreedPrice` bridge — see the module docblock.
      expect(majorToMinor(3600, 'TND')).toBe(3_600_000);
      expect(majorToMinor(3.605, 'TND')).toBe(3605);
      expect(majorToMinor(0.1 + 0.2, 'TND')).toBe(300);
    });

    it('rejects a nonsensical price', () => {
      expectCode(() => majorToMinor(-1, 'TND'), ERROR_CODES.INVALID_AMOUNT);
      expectCode(() => majorToMinor(Number.NaN, 'TND'), ERROR_CODES.INVALID_AMOUNT);
    });
  });
});

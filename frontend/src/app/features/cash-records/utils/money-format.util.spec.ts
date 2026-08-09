import { describe, expect, it } from 'vitest';
import {
  createIdempotencyKey,
  formatMinor,
  formatMoney,
  minorUnitExponent,
  parseAmount,
} from './money-format.util';

describe('money formatting', () => {
  describe('minorUnitExponent', () => {
    it('knows the Tunisian dinar has three decimals', () => {
      expect(minorUnitExponent('TND')).toBe(3);
      expect(minorUnitExponent('tnd')).toBe(3);
    });

    it('falls back to two decimals for an unfamiliar currency', () => {
      expect(minorUnitExponent('EUR')).toBe(2);
      expect(minorUnitExponent('XYZ')).toBe(2);
    });
  });

  describe('formatMinor', () => {
    it('renders millimes as dinars', () => {
      expect(formatMinor(200_000, 'TND')).toBe('200.000');
      expect(formatMinor(150_750, 'TND')).toBe('150.750');
      expect(formatMinor(1, 'TND')).toBe('0.001');
      expect(formatMinor(0, 'TND')).toBe('0.000');
    });

    it('renders a negative difference, as a remaining balance can be', () => {
      expect(formatMinor(-50_000, 'TND')).toBe('-50.000');
    });

    it('appends the currency for display', () => {
      expect(formatMoney(3_600_000, 'TND')).toBe('3600.000 TND');
    });
  });

  describe('parseAmount', () => {
    it('converts what the user typed into millimes', () => {
      expect(parseAmount('200', 'TND').amountMinor).toBe(200_000);
      expect(parseAmount('150.5', 'TND').amountMinor).toBe(150_500);
      expect(parseAmount('150.750', 'TND').amountMinor).toBe(150_750);
    });

    it('accepts a comma, which is what a French keyboard produces', () => {
      expect(parseAmount('150,750', 'TND').amountMinor).toBe(150_750);
    });

    it('never loses a millime to floating point', () => {
      // The exact figures that break `Number(x) * 1000`.
      expect(parseAmount('3.605', 'TND').amountMinor).toBe(3605);
      expect(parseAmount('0.29', 'EUR').amountMinor).toBe(29);
    });

    it('round-trips against the formatter', () => {
      for (const amount of ['200.000', '150.750', '0.001', '3.605']) {
        const { amountMinor } = parseAmount(amount, 'TND');
        expect(formatMinor(amountMinor ?? 0, 'TND')).toBe(amount);
      }
    });

    it('explains an empty field rather than failing silently', () => {
      const result = parseAmount('  ', 'TND');
      expect(result.amountMinor).toBeNull();
      expect(result.error).toBe('Enter the amount received.');
    });

    it('rejects zero and text', () => {
      expect(parseAmount('0', 'TND').amountMinor).toBeNull();
      expect(parseAmount('0.000', 'TND').amountMinor).toBeNull();
      expect(parseAmount('abc', 'TND').amountMinor).toBeNull();
      expect(parseAmount('-50', 'TND').amountMinor).toBeNull();
    });

    it('rejects more decimals than the currency has, naming the limit', () => {
      const result = parseAmount('1.2345', 'TND');
      expect(result.amountMinor).toBeNull();
      expect(result.error).toContain('3 decimal places');
    });
  });

  describe('createIdempotencyKey', () => {
    it('produces a distinct key per call', () => {
      const keys = new Set(Array.from({ length: 50 }, () => createIdempotencyKey()));
      expect(keys.size).toBe(50);
    });

    it('produces a key the backend schema accepts', () => {
      // 8–64 URL-safe characters, matching `idempotencyKeySchema`.
      const key = createIdempotencyKey();
      expect(key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    });
  });
});

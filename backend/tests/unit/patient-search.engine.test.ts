import { describe, expect, it } from 'vitest';
import {
  buildSmartPatientSearchFilter,
  calculatePatientSearchScore,
  normalizeSearchQuery,
  stripDiacritics,
  tokenizeSearchQuery,
} from '../../src/modules/patients/patient-search.engine.js';

describe('Smart Patient Search Engine', () => {
  const targetPatient = {
    firstName: 'Rayen',
    lastName: 'Mestiri',
    referenceNumber: 'P-2026-00142',
    phone: '+216 22 000 000',
  };

  const otherPatient1 = {
    firstName: 'Rayane',
    lastName: 'Mestiri',
    referenceNumber: 'P-2026-00143',
    phone: '+216 22 111 222',
  };

  const otherPatient2 = {
    firstName: 'Amine',
    lastName: 'Ben Salah',
    referenceNumber: 'P-2026-00050',
    phone: '+216 98 123 456',
  };

  describe('1. Normalization & Tokenization', () => {
    it('normalizes empty strings and whitespace', () => {
      expect(normalizeSearchQuery('')).toBe('');
      expect(normalizeSearchQuery('   ')).toBe('');
      expect(tokenizeSearchQuery('')).toEqual([]);
      expect(tokenizeSearchQuery('   ')).toEqual([]);
    });

    it('collapses multiple whitespace and trims', () => {
      expect(normalizeSearchQuery('  Rayen    Mestiri  ')).toBe('rayen mestiri');
      expect(tokenizeSearchQuery('  Rayen    Mestiri  ')).toEqual(['rayen', 'mestiri']);
    });

    it('strips accents properly', () => {
      expect(stripDiacritics('RAYÉN MESTÍRI')).toBe('rayen mestiri');
      expect(stripDiacritics('Éléonore Chérif')).toBe('eleonore cherif');
    });
  });

  describe('2. Query Filter Matrix (Token-based, Order-independent, Partial)', () => {
    // Helper to evaluate if a mock patient matches the generated filter conditions in-memory
    function matchesFilter(patient: typeof targetPatient, filter: Record<string, unknown>): boolean {
      if (Object.keys(filter).length === 0) return false;

      const evaluateCondition = (cond: Record<string, unknown>): boolean => {
        if ('$and' in cond && Array.isArray(cond.$and)) {
          return cond.$and.every((c) => evaluateCondition(c as Record<string, unknown>));
        }
        if ('$or' in cond && Array.isArray(cond.$or)) {
          return cond.$or.some((c) => evaluateCondition(c as Record<string, unknown>));
        }
        for (const [key, value] of Object.entries(cond)) {
          const patientVal = (patient as Record<string, unknown>)[key];
          if (typeof patientVal !== 'string') return false;
          if (value && typeof value === 'object' && '$regex' in value) {
            const reg = new RegExp(
              (value as { $regex: string }).$regex,
              (value as { $options?: string }).$options || 'i',
            );
            if (!reg.test(patientVal)) return false;
          }
        }
        return true;
      };

      return evaluateCondition(filter);
    }

    const testQueries = [
      'Rayen',
      'rayen',
      'RAYEN',
      'rAyEn',
      'Raye',
      'Ray',
      'Ra',
      'Mestiri',
      'mestiri',
      'MESTIRI',
      'Mesti',
      'Mest',
      'Mes',
      'Rayen Mestiri',
      'rayen mestiri',
      'RAYEN MESTIRI',
      'Rayen  Mestiri',
      'Rayen    Mestiri',
      'Mestiri Rayen',
      'mestiri rayen',
      'MESTIRI RAYEN',
      'Rayen Mest',
      'Raye Mesti',
      'Ray Mest',
      'Mest Ray',
      'Mestiri Ray',
      'RAYÉN MESTÍRI',
      'rayén mestíri',
    ];

    for (const q of testQueries) {
      it(`matches target patient "Rayen Mestiri" with query: "${q}"`, () => {
        const filter = buildSmartPatientSearchFilter(q);
        expect(matchesFilter(targetPatient, filter)).toBe(true);
      });
    }

    it('matches patient by phone number with and without spaces', () => {
      const phoneFilter1 = buildSmartPatientSearchFilter('22 000 000');
      expect(matchesFilter(targetPatient, phoneFilter1)).toBe(true);

      const phoneFilter2 = buildSmartPatientSearchFilter('22000000');
      expect(matchesFilter(targetPatient, phoneFilter2)).toBe(true);

      const phoneFilter3 = buildSmartPatientSearchFilter('98 123 456');
      expect(matchesFilter(otherPatient2, phoneFilter3)).toBe(true);
      expect(matchesFilter(targetPatient, phoneFilter3)).toBe(false);
    });

    it('matches patient by reference number', () => {
      const refFilter = buildSmartPatientSearchFilter('P-2026-00142');
      expect(matchesFilter(targetPatient, refFilter)).toBe(true);
      expect(matchesFilter(otherPatient1, refFilter)).toBe(false);
    });

    it('does not match unrelated patient', () => {
      const filter = buildSmartPatientSearchFilter('Rayen Mestiri');
      expect(matchesFilter(otherPatient2, filter)).toBe(false);
    });
  });

  describe('3. Relevance Scoring & Priority Matrix', () => {
    it('ranks exact full name highest (Score 1000)', () => {
      const score1 = calculatePatientSearchScore(targetPatient, 'Rayen Mestiri');
      const score2 = calculatePatientSearchScore(targetPatient, 'Mestiri Rayen');
      expect(score1).toBe(1000);
      expect(score2).toBe(1000);
    });

    it('ranks exact full name higher than partial or typos', () => {
      const exactScore = calculatePatientSearchScore(targetPatient, 'Rayen Mestiri');
      const partialScore = calculatePatientSearchScore(targetPatient, 'Rayen Mest');
      const singleScore = calculatePatientSearchScore(targetPatient, 'Rayen');

      expect(exactScore).toBeGreaterThan(partialScore);
      expect(partialScore).toBeGreaterThan(singleScore);
    });

    it('ranks "Rayen Mest" higher for "Rayen Mestiri" than for "Rayane Mestiri"', () => {
      const targetScore = calculatePatientSearchScore(targetPatient, 'Rayen Mest');
      const otherScore = calculatePatientSearchScore(otherPatient1, 'Rayen Mest');

      expect(targetScore).toBe(900); // exact first + prefix last
      expect(otherScore).toBe(100); // Rayen is not a prefix of Rayane
      expect(targetScore).toBeGreaterThan(otherScore);
    });

    it('ranks prefix matches like "Ray Mest" with score 700 for both prefix matches', () => {
      const targetScore = calculatePatientSearchScore(targetPatient, 'Ray Mest');
      const otherScore = calculatePatientSearchScore(otherPatient1, 'Ray Mest');

      expect(targetScore).toBe(700); // prefix first ("Rayen") + prefix last ("Mestiri")
      expect(otherScore).toBe(700); // prefix first ("Rayane") + prefix last ("Mestiri")
    });

    it('ranks "Mest Ray" properly with inverted terms', () => {
      const score = calculatePatientSearchScore(targetPatient, 'Mest Ray');
      expect(score).toBe(700);
    });

    it('ranks exact first name alone higher than prefix or contains', () => {
      const exactFirst = calculatePatientSearchScore(targetPatient, 'Rayen');
      const prefixFirst = calculatePatientSearchScore(targetPatient, 'Ray');
      expect(exactFirst).toBe(500);
      expect(prefixFirst).toBe(450);
    });

    it('ranks exact last name alone higher than prefix', () => {
      const exactLast = calculatePatientSearchScore(targetPatient, 'Mestiri');
      const prefixLast = calculatePatientSearchScore(targetPatient, 'Mest');
      expect(exactLast).toBe(490);
      expect(prefixLast).toBe(440);
    });
  });
});

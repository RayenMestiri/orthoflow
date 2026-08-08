import { describe, expect, it } from 'vitest';
import { parseDurationToSeconds } from '../../src/common/utils/duration.js';
import { isValidObjectId } from '../../src/common/utils/object-id.js';
import { buildPaginationMeta, toPaginationParams } from '../../src/common/utils/pagination.js';
import { buildUniqueSlug, slugify } from '../../src/common/utils/slug.js';
import { escapeRegex } from '../../src/infrastructure/database/query.helpers.js';

describe('parseDurationToSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['2h', 7200],
    ['30d', 2_592_000],
  ])('converts %s', (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected);
  });

  it('rejects nonsense durations', () => {
    expect(() => parseDurationToSeconds('soon')).toThrow();
    expect(() => parseDurationToSeconds('0m')).toThrow();
    expect(() => parseDurationToSeconds('-5m')).toThrow();
  });
});

describe('toPaginationParams', () => {
  it('applies defaults', () => {
    expect(toPaginationParams()).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('computes skip from the page', () => {
    expect(toPaginationParams({ page: 3, limit: 25 })).toEqual({ page: 3, limit: 25, skip: 50 });
  });

  it('caps the page size so a client cannot request the whole collection', () => {
    expect(toPaginationParams({ limit: 100_000 }).limit).toBe(100);
  });

  it('clamps nonsensical input instead of producing a negative skip', () => {
    expect(toPaginationParams({ page: -4, limit: 0 })).toEqual({ page: 1, limit: 1, skip: 0 });
  });
});

describe('buildPaginationMeta', () => {
  it('reports the number of pages', () => {
    expect(buildPaginationMeta({ page: 1, limit: 20, skip: 0 }, 100)).toEqual({
      page: 1,
      limit: 20,
      total: 100,
      pages: 5,
    });
  });

  it('rounds a partial last page up', () => {
    expect(buildPaginationMeta({ page: 1, limit: 20, skip: 0 }, 101).pages).toBe(6);
  });

  it('reports zero pages for an empty result', () => {
    expect(buildPaginationMeta({ page: 1, limit: 20, skip: 0 }, 0).pages).toBe(0);
  });
});

describe('isValidObjectId', () => {
  it('accepts a canonical 24-hex id', () => {
    expect(isValidObjectId('652f1c9b8a1e4f0012ab34cd')).toBe(true);
  });

  it('rejects the 12-character strings that mongoose would wrongly accept', () => {
    expect(isValidObjectId('clinic-abcde')).toBe(false);
    expect(isValidObjectId('')).toBe(false);
    expect(isValidObjectId({ $ne: null })).toBe(false);
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Cabinet Dentaire Al Amal')).toBe('cabinet-dentaire-al-amal');
  });

  it('keeps accented letters readable', () => {
    expect(slugify('Clinique Béja')).toBe('clinique-beja');
  });

  it('drops punctuation and collapses separators', () => {
    expect(slugify('  Dr. Amine — Ortho & Co.  ')).toBe('dr-amine-ortho-co');
  });

  it('appends a suffix when the slug is taken', async () => {
    const taken = new Set(['clinique-beja', 'clinique-beja-2']);
    const slug = await buildUniqueSlug('Clinique Béja', (candidate) =>
      Promise.resolve(taken.has(candidate)),
    );

    expect(slug).toBe('clinique-beja-3');
  });
});

describe('escapeRegex', () => {
  it('neutralizes regex metacharacters in a search term', () => {
    expect(escapeRegex('.*')).toBe('\\.\\*');
    expect(escapeRegex('a(b')).toBe('a\\(b');
  });
});

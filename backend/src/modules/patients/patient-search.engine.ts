import { escapeRegex } from '../../infrastructure/database/query.helpers.js';

/**
 * Normalizes French and Latin diacritics / accents into a character class regex pattern.
 * e.g. 'e' becomes '[eéèêëēĕėęě]', 'c' becomes '[cçćĉċč]'.
 */
const DIACRITIC_CHAR_MAP: Record<string, string> = {
  a: '[aàáâãäåāăą]',
  e: '[eèéêëēĕėęě]',
  i: '[iìíîïīĭįı]',
  o: '[oòóôõöøōŏő]',
  u: '[uùúûüūŭůűų]',
  c: '[cçćĉċč]',
  n: '[nñńņň]',
  s: '[sśŝşš]',
  y: '[yýÿŷ]',
  z: '[zźżž]',
};

/**
 * Strips accents from a string for plain comparison (e.g. "Mestíri" -> "mestiri").
 */
export function stripDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Central normalization:
 * 1. Trim leading/trailing whitespace
 * 2. Collapse multiple whitespace into a single space
 * 3. Lowercase
 */
export function normalizeSearchQuery(query: string): string {
  if (!query) return '';
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Splits normalized query into discrete search tokens.
 */
export function tokenizeSearchQuery(query: string): string[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [];
  return normalized.split(' ').filter((token) => token.length > 0);
}

/**
 * Constructs a RegExp that matches both accented and unaccented variations of the token,
 * case-insensitively.
 */
export function buildDiacriticRegex(token: string): { $regex: string; $options: string } {
  const stripped = stripDiacritics(token);
  let pattern = '';

  for (const char of stripped) {
    if (DIACRITIC_CHAR_MAP[char]) {
      pattern += DIACRITIC_CHAR_MAP[char];
    } else {
      pattern += escapeRegex(char);
    }
  }

  return { $regex: pattern, $options: 'i' };
}

/**
 * Builds flexible regex for phone matching allowing optional spaces, dots, dashes between digits.
 */
export function buildPhoneFlexibleRegex(digits: string): { $regex: string; $options: string } {
  const escapedDigits = digits.split('').map((d) => escapeRegex(d));
  const pattern = escapedDigits.join('[\\s.-]?');
  return { $regex: pattern, $options: 'i' };
}

/**
 * Builds the MongoDB query condition for a single token.
 * Token can match firstName OR lastName OR referenceNumber OR phone OR email.
 */
function buildTokenCondition(token: string): Record<string, unknown> {
  const regex = buildDiacriticRegex(token);
  const conditions: Array<Record<string, unknown>> = [
    { firstName: regex },
    { lastName: regex },
    { referenceNumber: regex },
    { email: regex },
  ];

  const digits = token.replace(/\D/g, '');
  if (digits.length >= 2) {
    conditions.push({ phone: buildPhoneFlexibleRegex(digits) });
  } else {
    conditions.push({ phone: regex });
  }

  return { $or: conditions };
}

/**
 * Centralized query builder for smart patient search.
 * Produces an order-independent, multi-term condition with phone & reference support:
 * (token1 matches firstName OR lastName OR ...) AND (token2 matches firstName OR lastName OR ...)
 */
export function buildSmartPatientSearchFilter(query: string): Record<string, unknown> {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) {
    return {};
  }

  const tokenConditions = tokens.map((token) => buildTokenCondition(token));
  const andCondition: Record<string, unknown> = { $and: tokenConditions };

  // Full-string phone fallback (e.g. user typed "98 123 456" with spaces)
  const fullDigits = query.replace(/\D/g, '');
  const alternatives: Array<Record<string, unknown>> = [andCondition];

  if (fullDigits.length >= 4) {
    alternatives.push({ phone: buildPhoneFlexibleRegex(fullDigits) });
  }

  const fullTrimmed = query.trim();
  if (tokens.length > 1 && /^[A-Za-z0-9-]+$/.test(fullTrimmed)) {
    alternatives.push({ referenceNumber: buildDiacriticRegex(fullTrimmed) });
  }

  if (alternatives.length === 1) {
    return andCondition;
  }

  return { $or: alternatives };
}

/**
 * Computes deterministic relevance score for a patient candidate:
 * Score 1000 - Exact full name (Rayen Mestiri or Mestiri Rayen)
 * Score 900  - Exact first + prefix last (Rayen Mest)
 * Score 850  - Prefix first + exact last (Ray Mestiri)
 * Score 800  - Exact last + prefix first (Mestiri Ray)
 * Score 750  - Prefix last + exact first (Mest Rayen)
 * Score 700  - Prefix first + prefix last (Ray Mest or Mest Ray)
 * Score 500  - Exact first name single term (Rayen)
 * Score 490  - Exact last name single term (Mestiri)
 * Score 450  - Prefix first name single term (Ray)
 * Score 440  - Prefix last name single term (Mest)
 * Score 400  - Contains term in first or last name
 * Score 300  - Phone or reference match
 * Score 100  - Other partial match
 */
export function calculatePatientSearchScore(
  patient: {
    firstName: string;
    lastName: string;
    referenceNumber?: string | null;
    phone?: string | null;
  },
  rawQuery: string,
): number {
  const tokens = tokenizeSearchQuery(rawQuery);
  if (tokens.length === 0) return 0;

  const firstNorm = stripDiacritics(patient.firstName || '');
  const lastNorm = stripDiacritics(patient.lastName || '');
  const fullNorm1 = `${firstNorm} ${lastNorm}`.trim();
  const fullNorm2 = `${lastNorm} ${firstNorm}`.trim();

  const queryNorm = stripDiacritics(normalizeSearchQuery(rawQuery));

  // Score 1: Exact full name match (either order)
  if (queryNorm === fullNorm1 || queryNorm === fullNorm2) {
    return 1000;
  }

  // Exact reference number
  if (
    patient.referenceNumber &&
    patient.referenceNumber.toUpperCase() === rawQuery.trim().toUpperCase()
  ) {
    return 950;
  }

  // Two or more tokens
  if (tokens.length >= 2 && tokens[0] && tokens[1]) {
    const t0 = stripDiacritics(tokens[0]);
    const t1 = stripDiacritics(tokens[1]);

    // Exact first + prefix last
    if (firstNorm === t0 && lastNorm.startsWith(t1)) return 900;
    // Prefix first + exact last
    if (firstNorm.startsWith(t0) && lastNorm === t1) return 850;
    // Exact last + prefix first (inverted)
    if (lastNorm === t0 && firstNorm.startsWith(t1)) return 800;
    // Prefix last + exact first (inverted)
    if (lastNorm.startsWith(t0) && firstNorm === t1) return 750;

    // Both prefix
    if (
      (firstNorm.startsWith(t0) && lastNorm.startsWith(t1)) ||
      (lastNorm.startsWith(t0) && firstNorm.startsWith(t1))
    ) {
      return 700;
    }

    // Both tokens anywhere in full name
    if (fullNorm1.includes(t0) && fullNorm1.includes(t1)) {
      return 600;
    }
  }

  // Single token
  if (tokens.length === 1 && tokens[0]) {
    const t = stripDiacritics(tokens[0]);
    if (firstNorm === t) return 500;
    if (lastNorm === t) return 490;
    if (firstNorm.startsWith(t)) return 450;
    if (lastNorm.startsWith(t)) return 440;
    if (firstNorm.includes(t) || lastNorm.includes(t)) return 400;
  }

  // Phone match
  const digits = rawQuery.replace(/\D/g, '');
  if (digits.length >= 4 && patient.phone) {
    const phoneDigits = patient.phone.replace(/\D/g, '');
    if (phoneDigits === digits) return 850;
    if (phoneDigits.includes(digits)) return 650;
  }

  return 100;
}

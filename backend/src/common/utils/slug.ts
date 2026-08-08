/** Unicode combining diacritical marks, stripped after NFKD normalization. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Builds a URL-safe slug from arbitrary clinic names.
 *
 * NFKD normalization plus combining-mark stripping keeps accented Latin names
 * (`Clinique Béja`) readable as `clinique-beja` instead of losing the letters.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Resolves a slug collision by appending an incrementing suffix.
 * The caller supplies the availability check so this stays pure and testable.
 */
export async function buildUniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxAttempts = 50,
): Promise<string> {
  const root = slugify(base) || 'clinic';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  // Extremely unlikely; keeps the caller from looping forever.
  return `${root}-${Date.now().toString(36)}`;
}

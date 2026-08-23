import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { ValidationError } from '../../common/errors/app-error.js';

export const CONSENT_PLACEHOLDERS = [
  'patient.fullName',
  'guardian.fullName',
  'signer.fullName',
  'clinic.name',
  'doctor.fullName',
  'treatment.label',
  'date',
] as const;

export type ConsentPlaceholder = (typeof CONSENT_PLACEHOLDERS)[number];
export type ConsentPlaceholderValues = Record<ConsentPlaceholder, string>;

const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9.]+)\s*}}/g;
const ALLOWED = new Set<string>(CONSENT_PLACEHOLDERS);

export function assertSafeConsentTemplate(content: string): void {
  const unknown = new Set<string>();
  for (const match of content.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1];
    if (name && !ALLOWED.has(name)) unknown.add(name);
  }
  if (unknown.size > 0) {
    throw new ValidationError(`Unsupported consent placeholder: ${Array.from(unknown).join(', ')}`, {
      code: ERROR_CODES.INVALID_CONSENT_TEMPLATE,
    });
  }
  const withoutPlaceholders = content.replace(PLACEHOLDER_PATTERN, '');
  if (withoutPlaceholders.includes('{{') || withoutPlaceholders.includes('}}')) {
    throw new ValidationError('Consent template contains a malformed placeholder', {
      code: ERROR_CODES.INVALID_CONSENT_TEMPLATE,
    });
  }
}

export function renderConsentTemplate(
  content: string,
  values: ConsentPlaceholderValues,
): string {
  assertSafeConsentTemplate(content);
  return content.replace(PLACEHOLDER_PATTERN, (_whole, key: ConsentPlaceholder) => values[key] ?? '—');
}

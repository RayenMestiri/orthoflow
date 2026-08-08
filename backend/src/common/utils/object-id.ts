import { Types } from 'mongoose';
import { ERROR_CODES } from '../constants/error-codes.js';
import { ValidationError } from '../errors/app-error.js';

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Strict ObjectId check.
 *
 * `mongoose.isValidObjectId` accepts any 12-character string and numbers, which
 * makes it useless as an input guard — a 12-char user-supplied string would sail
 * through and silently match nothing. We require the canonical 24-hex form.
 */
export function isValidObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

/** Converts a validated id string into an ObjectId, or throws a 400. */
export function toObjectId(value: string, field = 'id'): Types.ObjectId {
  if (!isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${field}`, {
      code: ERROR_CODES.VALIDATION_ERROR,
      details: { field, reason: 'must be a 24-character hexadecimal id' },
    });
  }
  return new Types.ObjectId(value);
}

/** Narrow helper for comparing an ObjectId-ish value against a string id. */
export function idEquals(a: Types.ObjectId | string, b: Types.ObjectId | string): boolean {
  return String(a) === String(b);
}

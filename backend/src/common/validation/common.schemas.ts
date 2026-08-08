import { z } from 'zod';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../utils/pagination.js';

/** Canonical 24-hex MongoDB id, as it appears in URLs and payloads. */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hexadecimal id')
  .meta({ description: 'MongoDB ObjectId', example: '652f1c9b8a1e4f0012ab34cd' });

export const emailSchema = z
  .email('must be a valid email address')
  .trim()
  .toLowerCase()
  .max(254)
  .meta({ example: 'dr.amine@clinic.tn' });

/**
 * Password policy for the MVP: long enough to resist offline cracking once
 * Argon2 is applied, without pushing users into unmemorable rules.
 */
export const passwordSchema = z
  .string()
  .min(10, 'must be at least 10 characters')
  .max(128, 'must be at most 128 characters')
  .refine((value) => /[a-zA-Z]/.test(value) && /\d/.test(value), {
    message: 'must contain at least one letter and one digit',
  });

export const personNameSchema = z.string().trim().min(1, 'is required').max(80);

/** Loose on purpose: OrthoFlow is multi-country and numbers are typed by hand. */
export const phoneSchema = z
  .string()
  .trim()
  .min(6)
  .max(32)
  .regex(/^[+]?[0-9\s().-]+$/, 'must be a valid phone number')
  .meta({ example: '+216 20 123 456' });

export const isoDateSchema = z.iso
  .date()
  .meta({ description: 'Calendar date (YYYY-MM-DD)', example: '2014-03-21' });

export const isoDateTimeSchema = z.iso
  .datetime()
  .meta({ description: 'ISO-8601 UTC timestamp', example: '2026-01-14T09:30:00.000Z' });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc');

/** Free-text search term, trimmed and length-capped before it reaches Mongo. */
export const searchQuerySchema = z.string().trim().min(1).max(120).optional();

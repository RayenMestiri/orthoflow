import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Generates a high-entropy opaque secret (refresh tokens, invite codes).
 * 32 bytes = 256 bits, which is far beyond guessable.
 */
export function generateOpaqueSecret(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

/**
 * SHA-256, hex encoded.
 *
 * Used to fingerprint refresh tokens before storing them. A password needs a
 * slow KDF because it is low entropy and human chosen; a 256-bit random token
 * does not — SHA-256 is the right tool and keeps lookups cheap.
 */
export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests of equal length. */
export function safeCompareHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

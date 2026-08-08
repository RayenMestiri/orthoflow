import argon2 from 'argon2';

/**
 * Argon2id parameters.
 *
 * Follows the OWASP Password Storage Cheat Sheet baseline (19 MiB memory,
 * 2 iterations, 1 degree of parallelism). Memory cost is the expensive knob for
 * an attacker with GPUs, so we spend there rather than on iterations.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Upper bound so an enormous body cannot turn into a CPU/memory DoS. */
const MAX_PASSWORD_BYTES = 1024;

export class PasswordService {
  async hash(plainPassword: string): Promise<string> {
    this.assertHashable(plainPassword);
    return argon2.hash(plainPassword, ARGON2_OPTIONS);
  }

  /**
   * Verifies a password against a stored hash.
   *
   * Never throws on a malformed hash — a corrupt record must read as "wrong
   * password", not as a 500 that tells an attacker the account exists.
   */
  async verify(storedHash: string, plainPassword: string): Promise<boolean> {
    if (storedHash.length === 0 || Buffer.byteLength(plainPassword) > MAX_PASSWORD_BYTES) {
      return false;
    }
    try {
      return await argon2.verify(storedHash, plainPassword);
    } catch {
      return false;
    }
  }

  /** True when a stored hash was produced with weaker parameters than current. */
  needsRehash(storedHash: string): boolean {
    try {
      return argon2.needsRehash(storedHash, ARGON2_OPTIONS);
    } catch {
      return true;
    }
  }

  private assertHashable(plainPassword: string): void {
    if (Buffer.byteLength(plainPassword) > MAX_PASSWORD_BYTES) {
      throw new Error('Password exceeds the maximum supported length');
    }
  }
}

export const passwordService = new PasswordService();

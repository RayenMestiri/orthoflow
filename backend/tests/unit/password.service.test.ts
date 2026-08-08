import { describe, expect, it } from 'vitest';
import { passwordService } from '../../src/infrastructure/security/password.service.js';

describe('PasswordService', () => {
  it('produces an Argon2id digest that does not contain the password', async () => {
    const hash = await passwordService.hash('Correct-Horse-1');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('Correct-Horse-1');
  });

  it('salts each hash, so the same password never produces the same digest', async () => {
    const [first, second] = await Promise.all([
      passwordService.hash('Correct-Horse-1'),
      passwordService.hash('Correct-Horse-1'),
    ]);

    expect(first).not.toBe(second);
    await expect(passwordService.verify(first, 'Correct-Horse-1')).resolves.toBe(true);
    await expect(passwordService.verify(second, 'Correct-Horse-1')).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await passwordService.hash('Correct-Horse-1');

    await expect(passwordService.verify(hash, 'correct-horse-1')).resolves.toBe(false);
    await expect(passwordService.verify(hash, '')).resolves.toBe(false);
  });

  it('returns false instead of throwing when the stored hash is corrupt', async () => {
    await expect(passwordService.verify('not-a-hash', 'Correct-Horse-1')).resolves.toBe(false);
    await expect(passwordService.verify('', 'Correct-Horse-1')).resolves.toBe(false);
  });

  it('does not ask for a rehash when the digest uses current parameters', async () => {
    const hash = await passwordService.hash('Correct-Horse-1');

    expect(passwordService.needsRehash(hash)).toBe(false);
  });
});

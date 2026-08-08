import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from '../../src/config/env.js';

const validEnv = {
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/orthoflow',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  AUTH_CODE_SECRET: 'c'.repeat(40),
};

describe('parseEnv', () => {
  it('applies defaults for everything that is not required', () => {
    const env = parseEnv(validEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.MONGODB_DB_NAME).toBe('orthoflow');
    expect(env.JWT_ACCESS_EXPIRES_IN).toBe('15m');
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.AUTH_CODE_EXPIRES_IN).toBe('10m');
  });

  it('coerces numeric and boolean strings into real types', () => {
    const env = parseEnv({
      ...validEnv,
      PORT: '8080',
      BODY_LIMIT_BYTES: '2048',
      MONGODB_TRANSACTIONS_ENABLED: 'false',
    });

    expect(env.PORT).toBe(8080);
    expect(env.BODY_LIMIT_BYTES).toBe(2048);
    expect(env.MONGODB_TRANSACTIONS_ENABLED).toBe(false);
  });

  it('treats an empty value as "not provided" so the default applies', () => {
    const env = parseEnv({ ...validEnv, MONGODB_DB_NAME: '', CORS_ADDITIONAL_ORIGINS: '' });

    expect(env.MONGODB_DB_NAME).toBe('orthoflow');
    expect(env.CORS_ADDITIONAL_ORIGINS).toBe('');
  });

  it('rejects a missing database URI', () => {
    expect(() => parseEnv({ ...validEnv, MONGODB_URI: undefined })).toThrow(EnvValidationError);
  });

  it('rejects a connection string that is not MongoDB', () => {
    expect(() => parseEnv({ ...validEnv, MONGODB_URI: 'postgres://localhost/db' })).toThrow(
      /MONGODB_URI/,
    );
  });

  it('rejects short signing secrets', () => {
    expect(() => parseEnv({ ...validEnv, JWT_ACCESS_SECRET: 'too-short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('rejects reusing one secret for both access and refresh tokens', () => {
    const secret = 'c'.repeat(40);
    expect(() =>
      parseEnv({ ...validEnv, JWT_ACCESS_SECRET: secret, JWT_REFRESH_SECRET: secret }),
    ).toThrow(/must be different/);
  });

  it('refuses placeholder secrets and a localhost database in production', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://localhost:27017/orthoflow',
        JWT_ACCESS_SECRET: `change-me-${'x'.repeat(30)}`,
      }),
    ).toThrow(EnvValidationError);
  });

  it('reports every problem at once instead of failing on the first', () => {
    try {
      parseEnv({ JWT_ACCESS_SECRET: 'short' });
      expect.unreachable('parseEnv should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues.length).toBeGreaterThanOrEqual(3);
    }
  });
});

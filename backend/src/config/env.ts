import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Central, validated environment configuration.
 *
 * This is the ONLY module in the codebase allowed to touch `process.env`
 * (enforced by the `no-restricted-properties` ESLint rule). Everything else
 * imports the typed `env` object exported below.
 */

loadDotenv({ quiet: true });

const durationPattern = /^\d+(ms|s|m|h|d|w|y)$/;
const mongoUriPattern = /^mongodb(\+srv)?:\/\/.+/;

export const envSchema = z
  .object({
    // --- Runtime ---------------------------------------------------------
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    HOST: z.string().min(1).default('0.0.0.0'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // --- Database --------------------------------------------------------
    MONGODB_URI: z
      .string()
      .regex(mongoUriPattern, 'must be a mongodb:// or mongodb+srv:// connection string'),
    MONGODB_DB_NAME: z.string().min(1).default('orthoflow'),
    MONGODB_TRANSACTIONS_ENABLED: z.stringbool().default(true),

    // --- Authentication --------------------------------------------------
    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_ACCESS_EXPIRES_IN: z
      .string()
      .regex(durationPattern, 'must look like 15m, 1h, 7d')
      .default('15m'),
    JWT_REFRESH_EXPIRES_IN: z
      .string()
      .regex(durationPattern, 'must look like 15m, 1h, 30d')
      .default('30d'),
    JWT_ISSUER: z.string().min(1).default('orthoflow-api'),
    JWT_AUDIENCE: z.string().min(1).default('orthoflow-app'),
    PORTAL_JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'must be at least 32 characters')
      .default('portal-access-development-secret-32chars'),
    PORTAL_JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'must be at least 32 characters')
      .default('portal-refresh-development-secret-32chars'),
    PORTAL_JWT_ACCESS_EXPIRES_IN: z.string().regex(durationPattern).default('15m'),
    PORTAL_JWT_REFRESH_EXPIRES_IN: z.string().regex(durationPattern).default('30d'),
    PORTAL_JWT_AUDIENCE: z.string().min(1).default('orthoflow-portal'),
    PORTAL_INVITATION_EXPIRES_IN: z.string().regex(durationPattern).default('48h'),

    // --- Media storage ---------------------------------------------------
    CLOUDINARY_CLOUD_NAME: z.string().default(''),
    CLOUDINARY_API_KEY: z.string().default(''),
    CLOUDINARY_API_SECRET: z.string().default(''),
    CLOUDINARY_UPLOAD_FOLDER: z.string().min(1).default('orthoflow'),

    // --- Clients / CORS --------------------------------------------------
    FRONTEND_URL: z.url().default('http://localhost:4200'),
    CORS_ADDITIONAL_ORIGINS: z.string().default(''),

    // --- Hardening -------------------------------------------------------
    BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_WINDOW: z.string().min(1).default('1 minute'),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    AUTH_RATE_LIMIT_WINDOW: z.string().min(1).default('1 minute'),

    // --- API docs --------------------------------------------------------
    SWAGGER_ENABLED: z.stringbool().default(true),

    // --- Platform bootstrap ----------------------------------------------
    BOOTSTRAP_SUPER_ADMIN_EMAIL: z.union([z.literal(''), z.email()]).default(''),

    // --- Transactional email --------------------------------------------
    SMTP_HOST: z.string().default(''),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z.stringbool().default(false),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    SMTP_FROM_ADDRESS: z.union([z.literal(''), z.email()]).default(''),
    SMTP_FROM_NAME: z.string().trim().min(1).max(80).default('OrthoFlow'),
    AUTH_CODE_SECRET: z.string().min(32, 'must be at least 32 characters'),
    AUTH_CODE_EXPIRES_IN: z
      .string()
      .regex(durationPattern, 'must look like 10m, 1h')
      .default('10m'),
    AUTH_CODE_RESEND_COOLDOWN: z
      .string()
      .regex(durationPattern, 'must look like 1m, 5m')
      .default('1m'),
    AUTH_CODE_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),

    // --- Internal communication worker ----------------------------------
    NOTIFICATION_WORKER_ENABLED: z.stringbool().default(true),
    NOTIFICATION_WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
    NOTIFICATION_CONDITION_SWEEP_INTERVAL_MS: z.coerce.number().int().min(60_000).default(900_000),
    COMMUNICATION_WORKER_ENABLED: z.stringbool().default(true),
    COMMUNICATION_WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
    COMMUNICATION_REMINDER_SWEEP_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
    COMMUNICATION_PAYLOAD_SECRET: z
      .string()
      .min(32)
      .default('communication-development-secret-32chars'),
  })
  .superRefine((value, ctx) => {
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'must be different from JWT_ACCESS_SECRET',
      });
    }
    if (value.PORTAL_JWT_ACCESS_SECRET === value.PORTAL_JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['PORTAL_JWT_REFRESH_SECRET'],
        message: 'must be different from PORTAL_JWT_ACCESS_SECRET',
      });
    }
    if (
      [value.JWT_ACCESS_SECRET, value.JWT_REFRESH_SECRET].includes(
        value.PORTAL_JWT_ACCESS_SECRET,
      ) ||
      [value.JWT_ACCESS_SECRET, value.JWT_REFRESH_SECRET].includes(value.PORTAL_JWT_REFRESH_SECRET)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['PORTAL_JWT_ACCESS_SECRET'],
        message: 'portal JWT secrets must be distinct from staff JWT secrets',
      });
    }

    if (value.NODE_ENV === 'production') {
      if ((value.NOTIFICATION_WORKER_ENABLED || value.COMMUNICATION_WORKER_ENABLED) && !value.MONGODB_TRANSACTIONS_ENABLED) {
        ctx.addIssue({
          code: 'custom',
          path: ['MONGODB_TRANSACTIONS_ENABLED'],
          message: 'must be enabled in production when the notification outbox worker is enabled',
        });
      }
      if (value.MONGODB_URI.includes('localhost') || value.MONGODB_URI.includes('127.0.0.1')) {
        ctx.addIssue({
          code: 'custom',
          path: ['MONGODB_URI'],
          message: 'must not point at localhost in production',
        });
      }
      for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        if (value[key].toLowerCase().includes('change-me')) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'placeholder secret detected — set a real random secret in production',
          });
        }
      }
      for (const key of ['PORTAL_JWT_ACCESS_SECRET', 'PORTAL_JWT_REFRESH_SECRET'] as const) {
        if (
          value[key].toLowerCase().includes('development') ||
          value[key].toLowerCase().includes('change-me')
        ) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'placeholder secret detected — set a real random secret in production',
          });
        }
      }

      for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_ADDRESS'] as const) {
        if (value[key] === '') {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'is required in production',
          });
        }
      }

      if (value.AUTH_CODE_SECRET.toLowerCase().includes('change-me')) {
        ctx.addIssue({
          code: 'custom',
          path: ['AUTH_CODE_SECRET'],
          message: 'placeholder secret detected — set a real random secret in production',
        });
      }
      if (value.COMMUNICATION_PAYLOAD_SECRET.toLowerCase().includes('development')) {
        ctx.addIssue({
          code: 'custom',
          path: ['COMMUNICATION_PAYLOAD_SECRET'],
          message: 'placeholder secret detected — set a real random secret in production',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Treat empty strings as "not provided" so that `FOO=` in a `.env` file falls
 * back to the schema default instead of failing a `min(1)` check.
 */
function normalizeSource(source: Record<string, string | undefined>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== '') {
      normalized[key] = value;
    }
  }
  return normalized;
}

export class EnvValidationError extends Error {
  public readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/** Pure, testable environment parser. Throws {@link EnvValidationError}. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(normalizeSource(source));

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join('.') || '(root)';
      return `${path}: ${issue.message}`;
    });
    throw new EnvValidationError(issues);
  }

  return result.data;
}

export const env: Env = parseEnv(process.env);

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

/** Origins allowed to call the API from a browser. */
export const corsOrigins: string[] = [
  env.FRONTEND_URL,
  ...env.CORS_ADDITIONAL_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
];

/** Cloudinary is optional for the MVP; media routes stay disabled without it. */
export const isCloudinaryConfigured =
  env.CLOUDINARY_CLOUD_NAME !== '' &&
  env.CLOUDINARY_API_KEY !== '' &&
  env.CLOUDINARY_API_SECRET !== '';

/** Swagger UI is never served in production unless explicitly forced on. */
export const isSwaggerEnabled = env.SWAGGER_ENABLED && !isProduction;

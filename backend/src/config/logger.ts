import { pino, type LoggerOptions } from 'pino';
import { env, isDevelopment, isTest } from './env.js';

/**
 * Paths scrubbed from every log line.
 *
 * Logs are shipped, indexed and read by humans. Credentials, tokens and patient
 * identifiers must never end up in that pipeline — the redaction list is the
 * enforcement point, not developer discipline at each call site.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.body',
  'res.headers["set-cookie"]',
  'body',
  'patient',
  'patients',
  'clinicalNote',
  'doctorNote',
  'observations',
  'procedureDetails',
  'signature',
  'pdf',
  'content',
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'token',
  'tokenHash',
  'code',
  'codeHash',
  'SMTP_PASS',
  'COMMUNICATION_PAYLOAD_SECRET',
  'destinationSnapshot',
  'payloadSnapshot.portalUrlEncrypted',
  'err.config.headers.authorization',
  'err.config.headers.Authorization',
  '*.password',
  '*.passwordHash',
  '*.accessToken',
  '*.refreshToken',
  '*.code',
  '*.codeHash',
  '*.destinationSnapshot',
  '*.payloadSnapshot',
];

export const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      }
    : {}),
};

/**
 * Logger for code that runs outside a request (boot, seeds, background work).
 * Inside a request always prefer `request.log`, which carries the request id.
 */
export const logger = pino({ ...loggerOptions, ...(isTest ? { level: 'silent' } : {}) });

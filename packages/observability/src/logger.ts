/**
 * Structured logger (pino). PII-redacted by default.
 * Server-only — never imported in client code (cf. observability-monitoring skill).
 */
import pino from 'pino';

export type Logger = pino.Logger;

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.email',
  '*.phone',
  '*.guest_email',
  '*.guest_phone',
  '*.password',
  '*.token',
];

export const logger: Logger = pino({
  level: process.env['LOG_LEVEL'] ?? (process.env['NODE_ENV'] === 'production' ? 'info' : 'debug'),
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  base: {
    app: 'cct',
    env: process.env['SENTRY_ENV'] ?? process.env['NODE_ENV'] ?? 'dev',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Shared HTTP wrapper — all vendor integrations go through this.
 * Provides timeout, retry with exponential backoff + jitter, and a typed
 * envelope for downstream Zod parsing.
 *
 * Concrete retry policy and error mapping arrive in Phase 3.
 */
import { z } from 'zod';

export interface HttpRequestInit {
  readonly url: string;
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
  readonly retry?: { readonly attempts: number; readonly backoffMs: number };
  readonly idempotencyKey?: string;
}

export type HttpError =
  | { kind: 'timeout' }
  | { kind: 'network'; cause: unknown }
  | { kind: 'rate_limited'; retryAfterSec?: number }
  | { kind: 'auth_failed' }
  | { kind: 'not_found' }
  | { kind: 'upstream_5xx'; status: number }
  | { kind: 'upstream_4xx'; status: number; body?: unknown }
  | { kind: 'parse_failure'; details: string };

export interface HttpResult<T> {
  readonly status: number;
  readonly headers: Headers;
  readonly data: T;
}

/**
 * Placeholder for the shared httpRequest implementation.
 * Phase 3 will provide the full implementation including retries,
 * Sentry breadcrumbs and rate-limit awareness.
 */
export const httpRequestSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
});

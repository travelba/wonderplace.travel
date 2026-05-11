/**
 * Normalized HTTP failure shapes for vendor wrappers (skill: api-integration).
 */
export type HttpError =
  | { readonly kind: 'timeout' }
  | { readonly kind: 'network'; readonly cause: unknown }
  | { readonly kind: 'rate_limited'; readonly retryAfterSec?: number }
  | { readonly kind: 'auth_failed' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'upstream_5xx'; readonly status: number }
  | {
      readonly kind: 'upstream_4xx';
      readonly status: number;
      readonly body?: unknown;
    }
  | { readonly kind: 'parse_failure'; readonly details: string };

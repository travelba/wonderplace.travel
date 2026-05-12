/**
 * Content-Security-Policy builder.
 *
 * Strategy
 * --------
 * - `script-src` uses a per-request `nonce` + `'strict-dynamic'` (CSP3) so
 *   that the inline JSON-LD scripts we ship are explicitly allowed while
 *   arbitrary attacker-injected scripts are blocked. Modern browsers honour
 *   strict-dynamic; legacy ones fall back to `'self'`.
 * - `style-src` allows `'unsafe-inline'` because Tailwind, `next/font`, and
 *   React server-rendered style attributes routinely emit inline styles. This
 *   is the accepted trade-off documented in Next.js + Tailwind CSP guides.
 * - `connect-src` enumerates every vendor we call from the browser:
 *   Supabase, Upstash, Algolia, Amadeus, Brevo, Makcorps, Vercel Analytics,
 *   plus the in-origin Sentry tunnel (`/monitoring`).
 * - `frame-src` whitelists Amadeus hosted-fields domain (payment iframe — cf.
 *   payment-orchestration skill).
 * - `frame-ancestors 'none'` mirrors the `X-Frame-Options: DENY` static
 *   header set in `next.config.ts`.
 *
 * The generated header is identical for every request — only the nonce
 * value varies. We export `buildCspHeader` for unit testing.
 */

const SCRIPT_HOSTS = ["'self'"] as const;

const STYLE_HOSTS = ["'self'", "'unsafe-inline'"] as const;

const IMG_HOSTS = [
  "'self'",
  'data:',
  'blob:',
  'https://res.cloudinary.com',
  'https://*.supabase.co',
  // Wikimedia Maps OSM tile server — used by `HotelStaticMap` to ship
  // a free, no-API-key static map of the hotel location. The host is
  // operated by the Wikimedia Foundation, no PII leaves the browser
  // beyond the bare `lat,lon,zoom` baked into the tile URL.
  'https://maps.wikimedia.org',
] as const;

const FONT_HOSTS = ["'self'", 'data:'] as const;

const CONNECT_HOSTS = [
  "'self'",
  // Supabase REST + Realtime (auth refresh + RLS queries from RSC fetches).
  'https://*.supabase.co',
  'wss://*.supabase.co',
  // Upstash REST (Redis cache, rate limiting).
  'https://*.upstash.io',
  // Algolia search (browser-side autocomplete + facets).
  'https://*.algolia.net',
  'https://*.algolianet.com',
  // Amadeus Self-Service (hotel offers + booking — when called from RSCs the
  // browser doesn't see these, but client-side error reporting can).
  'https://test.api.amadeus.com',
  'https://api.amadeus.com',
  // Brevo (newsletter signup webhook from the client banner if ever moved).
  'https://api.brevo.com',
  // Vercel Analytics + Speed Insights.
  'https://vitals.vercel-insights.com',
  'https://*.vercel-analytics.com',
  'https://*.vercel-insights.com',
] as const;

const FRAME_HOSTS = [
  "'self'",
  // Amadeus Hosted Payment Page (iframe).
  'https://*.amadeus.com',
  // Immersive virtual-tour providers embedded on the hotel detail
  // page (see `apps/web/src/components/hotel/hotel-virtual-tour.tsx`
  // and migration `0023_hotel_virtual_tour.sql`). The DB CHECK
  // constraint forbids any other host so this allowlist mirrors the
  // exact set of values that can ever reach the iframe.
  'https://my.matterport.com',
  'https://kuula.co',
] as const;

const MEDIA_HOSTS = ["'self'", 'https://res.cloudinary.com'] as const;

const WORKER_HOSTS = ["'self'", 'blob:'] as const;

const MANIFEST_HOSTS = ["'self'"] as const;

const OBJECT_HOSTS = ["'none'"] as const;

const BASE_URI_HOSTS = ["'self'"] as const;

const FORM_ACTION_HOSTS = ["'self'"] as const;

const FRAME_ANCESTORS_HOSTS = ["'none'"] as const;

export interface BuildCspOptions {
  readonly nonce: string;
  readonly isDev: boolean;
}

/**
 * Returns the value of the `Content-Security-Policy` header for the current
 * request. In development we relax script-src to allow Next.js' eval-based
 * HMR; production keeps the strict nonce + strict-dynamic.
 */
export function buildCspHeader({ nonce, isDev }: BuildCspOptions): string {
  const scriptSrcParts = [
    ...SCRIPT_HOSTS,
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // HMR + RSC dev runtime needs eval-style code execution.
    ...(isDev ? ["'unsafe-eval'", "'wasm-unsafe-eval'"] : []),
  ];

  const directives: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
    ['default-src', ["'self'"]],
    ['script-src', scriptSrcParts],
    ['style-src', STYLE_HOSTS],
    ['img-src', IMG_HOSTS],
    ['font-src', FONT_HOSTS],
    ['connect-src', CONNECT_HOSTS],
    ['frame-src', FRAME_HOSTS],
    ['media-src', MEDIA_HOSTS],
    ['worker-src', WORKER_HOSTS],
    ['manifest-src', MANIFEST_HOSTS],
    ['object-src', OBJECT_HOSTS],
    ['base-uri', BASE_URI_HOSTS],
    ['form-action', FORM_ACTION_HOSTS],
    ['frame-ancestors', FRAME_ANCESTORS_HOSTS],
  ];

  const directiveLines = directives.map(([name, values]) => `${name} ${values.join(' ')}`);

  if (!isDev) {
    directiveLines.push('upgrade-insecure-requests');
  }

  return directiveLines.join('; ');
}

/**
 * Generates a 128-bit cryptographically-random nonce, base64-encoded.
 * Uses the platform `crypto` global (available in Edge + Node 19+).
 */
export function generateNonce(): string {
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);
  // base64 without padding for a more compact attribute value.
  let binary = '';
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/=+$/, '');
}

export const NONCE_HEADER = 'x-nonce';

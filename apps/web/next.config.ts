import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Bundle analyzer is opt-in (`ANALYZE=true pnpm --filter @cct/web build` or
// `pnpm --filter @cct/web analyze`). Skill: performance-engineering.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env['ANALYZE'] === 'true',
  openAnalyzer: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true,
    optimizePackageImports: ['lucide-react', '@cct/ui'],
  },
  transpilePackages: [
    '@cct/ui',
    '@cct/seo',
    '@cct/domain',
    '@cct/emails',
    '@cct/db',
    '@cct/integrations',
  ],
  // Allow NodeNext-style `.js` import specifiers in TS sources from
  // workspace packages (e.g. `export * from './client.js'`). Webpack
  // doesn't do the TS→JS extension swap by default; this teaches it to
  // try `.ts` / `.tsx` first when it sees a `.js` request.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
    deviceSizes: [320, 420, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
          },
          // RFC 8288: announce agent skills (cf. geo-llm-optimization skill)
          {
            key: 'Link',
            value: '</.well-known/agent-skills.json>; rel="agent-skills"',
          },
        ],
      },
      {
        // Tunnel + account: noindex (prefixed locales: /en/reservation, /en/compte, /en/auth).
        source: '/:locale(fr|en)/(reservation|compte|auth)/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        // FR is served without a locale prefix (next-intl as-needed mode), so
        // cover the bare paths too — otherwise the tunnel would be indexable
        // on the canonical FR URLs.
        source: '/(reservation|compte|auth)/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
  async redirects() {
    // Anti-cannibalisation 301 redirects (cf. CDC arborescence + ADR seo).
    // Final list managed via Payload `Redirects` collection in Phase 8.
    return [
      {
        source: '/:locale(fr|en)/selection/lune-de-miel',
        destination: '/:locale/selection/romantiques-et-lune-de-miel',
        permanent: true,
      },
      {
        source: '/:locale(fr|en)/selection/ski',
        destination: '/:locale/selection/montagne',
        permanent: true,
      },
      {
        source: '/:locale(fr|en)/selection/plage-privee',
        destination: '/:locale/selection/bord-de-mer-et-plage',
        permanent: true,
      },
    ];
  },
};

/**
 * Sentry wraps the outer layer so the Next.js build emits source maps and the
 * SDK can upload them at build time (skill: observability-monitoring).
 *
 * `tunnelRoute: '/monitoring'` routes browser beacons through our origin to
 * bypass adblockers — the matching path is already excluded from the
 * `middleware.ts` matcher.
 *
 * `silent: !CI` keeps local builds quiet; CI gets full upload logs. The auth
 * token is optional: when missing (CI smoke build, dev) no upload happens and
 * the wrapper degrades to plain `withNextIntl(nextConfig)` semantics.
 */
const sentryAuthToken = process.env['SENTRY_AUTH_TOKEN'];

export default withSentryConfig(withBundleAnalyzer(withNextIntl(nextConfig)), {
  org: 'travelba',
  project: 'cct-web',
  ...(sentryAuthToken !== undefined ? { authToken: sentryAuthToken } : {}),
  silent: process.env['CI'] !== 'true',
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',
  reactComponentAnnotation: { enabled: true },
  telemetry: false,
});

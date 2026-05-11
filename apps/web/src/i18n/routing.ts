import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
  // CDC §3.1 — FR (default) served from `/`, EN under `/en/...`.
  // `as-needed` mode achieves this natively without per-locale prefix
  // overrides. Explicit `prefixes: { fr: '/' }` triggers an infinite
  // redirect loop in next-intl 3.x because `'/'` is treated as a real
  // prefix segment.
  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];

export function isRoutingLocale(candidate: string | undefined): candidate is Locale {
  if (candidate === undefined) return false;
  for (const l of routing.locales) {
    if (l === candidate) return true;
  }
  return false;
}

/** Request locale from Accept-Language / prefix — falls back to default when unknown. */
export function resolveLocale(candidate: string | undefined): Locale {
  if (isRoutingLocale(candidate)) return candidate;
  return routing.defaultLocale;
}

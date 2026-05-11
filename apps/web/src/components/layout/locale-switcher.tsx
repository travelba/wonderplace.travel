'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { ReactElement } from 'react';

import { Link, usePathname } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';

/**
 * Pure-link locale switcher (skill: seo-technical §hreflang).
 *
 * Renders an `<a>` to the **same logical path** in the other locale.
 * `usePathname()` from `next-intl/navigation` returns the path WITHOUT
 * the locale prefix, so passing it to `<Link locale="…" />` re-prefixes
 * it correctly for the target locale.
 *
 * We preserve the query string verbatim — important on `/recherche`
 * where the form state lives in the URL — and never carry the fragment
 * (Next routing strips it client-side anyway).
 *
 * Returning a single `<a>` (instead of a `<button>`) gives crawlers a
 * proper `rel="alternate"`-equivalent link to the localized page, even
 * though we already emit `<link rel="alternate" hreflang>` in metadata.
 */
export function LocaleSwitcher(): ReactElement {
  const t = useTranslations('header.locale');
  const currentLocale = useLocale() as Locale;
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const otherLocale: Locale = currentLocale === 'fr' ? 'en' : routing.defaultLocale;
  const qs = searchParams.toString();
  const href = qs.length > 0 ? `${pathname}?${qs}` : pathname;

  return (
    <Link
      // `pathname` is treated as a typed route — cast through unknown
      // is the standard escape hatch in next-intl docs when the route
      // type cannot be statically derived.
      href={href as unknown as Parameters<typeof Link>[0]['href']}
      locale={otherLocale}
      aria-label={t('label')}
      hrefLang={otherLocale === 'fr' ? 'fr-FR' : 'en'}
      className="text-muted hover:bg-muted/10 hover:text-fg focus-visible:ring-ring rounded-md px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2"
    >
      <span aria-hidden>{otherLocale === 'fr' ? 'FR' : 'EN'}</span>
      <span className="sr-only">{t('switchTo')}</span>
    </Link>
  );
}

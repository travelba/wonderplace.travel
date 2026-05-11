import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { isRoutingLocale } from '@/i18n/routing';

/**
 * Build the canonical + hreflang + OG metadata for a legal page.
 * Same slug in both locales (`/<slug>` in FR, `/en/<slug>` in EN) —
 * mirrors the rest of the site.
 */
export async function buildLegalMetadata(args: {
  readonly locale: string;
  readonly slug: string;
  readonly translationsNamespace:
    | 'legal.noticePage'
    | 'legal.privacyPage'
    | 'legal.termsPage'
    | 'legal.cookiesPage';
}): Promise<Metadata> {
  if (!isRoutingLocale(args.locale)) return {};
  const t = await getTranslations({ locale: args.locale, namespace: args.translationsNamespace });
  const canonicalFr = `/${args.slug}`;
  const canonicalEn = `/en/${args.slug}`;
  const canonical = args.locale === 'fr' ? canonicalFr : canonicalEn;
  const title = t('title');
  const description = t('metaDescription');
  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        'fr-FR': canonicalFr,
        en: canonicalEn,
        'x-default': canonicalFr,
      },
    },
    openGraph: {
      type: 'article',
      title,
      description,
      locale: args.locale === 'fr' ? 'fr_FR' : 'en_US',
      siteName: 'ConciergeTravel',
    },
  };
}

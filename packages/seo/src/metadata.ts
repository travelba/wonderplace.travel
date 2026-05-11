import type { Metadata } from 'next';

export type SeoLocale = 'fr' | 'en';

export interface LocaleAlternate {
  readonly locale: SeoLocale;
  readonly url: string;
}

export interface BaseMetaInput {
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly localeAlternates: ReadonlyArray<LocaleAlternate>;
  readonly ogImage?: string;
  readonly ogType?: 'website' | 'article';
  readonly noIndex?: boolean;
  readonly publishedTime?: string;
  readonly modifiedTime?: string;
  readonly siteName?: string;
}

/**
 * Build the hreflang map (skill: seo-technical).
 * Always includes `x-default` pointing at the FR alternate when present.
 */
export const buildHreflangTags = (
  alternates: BaseMetaInput['localeAlternates'],
): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const alt of alternates) {
    map[alt.locale === 'fr' ? 'fr-FR' : 'en'] = alt.url;
  }
  const fr = alternates.find((a) => a.locale === 'fr');
  if (fr !== undefined) map['x-default'] = fr.url;
  return map;
};

/**
 * Returns a Next.js `Metadata` object with canonical, hreflang, OG, Twitter
 * and robots noindex flags (skill: seo-technical, geo-llm-optimization).
 */
export const buildPageMetadata = (input: BaseMetaInput): Metadata => {
  const ogType = input.ogType ?? 'website';
  const robots = input.noIndex === true ? { index: false, follow: false } : undefined;

  const metadata: Metadata = {
    title: input.title,
    description: input.description,
    alternates: {
      canonical: input.canonical,
      languages: buildHreflangTags(input.localeAlternates),
    },
    openGraph: {
      title: input.title,
      description: input.description,
      url: input.canonical,
      type: ogType,
      ...(input.siteName !== undefined ? { siteName: input.siteName } : {}),
      ...(input.ogImage !== undefined ? { images: [{ url: input.ogImage }] } : {}),
      ...(ogType === 'article' && input.publishedTime !== undefined
        ? { publishedTime: input.publishedTime }
        : {}),
      ...(ogType === 'article' && input.modifiedTime !== undefined
        ? { modifiedTime: input.modifiedTime }
        : {}),
    },
    twitter: {
      card: input.ogImage !== undefined ? 'summary_large_image' : 'summary',
      title: input.title,
      description: input.description,
      ...(input.ogImage !== undefined ? { images: [input.ogImage] } : {}),
    },
  };

  if (robots !== undefined) {
    metadata.robots = robots;
  }
  return metadata;
};

/**
 * Metadata helpers consumed by Next.js `generateMetadata`.
 * Concrete builders arrive in Phase 5 / 9.
 */
export interface BaseMetaInput {
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly localeAlternates: ReadonlyArray<{ readonly locale: 'fr' | 'en'; readonly url: string }>;
  readonly ogImage?: string;
  readonly noIndex?: boolean;
}

export const buildHreflangTags = (
  alternates: BaseMetaInput['localeAlternates'],
): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const alt of alternates) {
    map[alt.locale === 'fr' ? 'fr-FR' : 'en'] = alt.url;
  }
  const fr = alternates.find((a) => a.locale === 'fr');
  if (fr) map['x-default'] = fr.url;
  return map;
};

import type { ReactElement } from 'react';

/**
 * "Sources & références" block, rendered at the bottom of a guide
 * or ranking. Reflects the JSONB `external_sources` column, where
 * the editorial pipeline has already filtered every URL against the
 * allowlist (Wikipedia, Atout France, UNESCO, Michelin, official
 * domains, regional tourist offices, press of reference).
 *
 * EEAT trust signal — both for search engines (Google citations,
 * E-A-T evaluation) and for LLM crawlers (ChatGPT/Perplexity citing
 * the page back to its sources).
 *
 * Skill: seo-technical §EEAT, geo-llm-optimization.
 */

export type ExternalSourceType =
  | 'wikipedia'
  | 'official'
  | 'unesco'
  | 'michelin'
  | 'atout_france'
  | 'tourist_office'
  | 'wikidata'
  | 'press'
  | 'wikimedia_commons'
  | 'gov'
  | 'other';

const KNOWN_TYPES: readonly ExternalSourceType[] = [
  'wikipedia',
  'official',
  'unesco',
  'michelin',
  'atout_france',
  'tourist_office',
  'wikidata',
  'press',
  'wikimedia_commons',
  'gov',
  'other',
];

function normalizeType(value: string): ExternalSourceType {
  return (KNOWN_TYPES as readonly string[]).includes(value)
    ? (value as ExternalSourceType)
    : 'other';
}

export interface ExternalSourceData {
  readonly url: string;
  readonly label_fr: string;
  readonly label_en?: string;
  /** Free-form so we can absorb LLM-generated synonyms. */
  readonly type: string;
}

interface Props {
  readonly sources: readonly ExternalSourceData[];
  readonly locale: 'fr' | 'en';
}

const TYPE_GROUP_FR: Readonly<Record<ExternalSourceType, string>> = {
  wikipedia: 'Encyclopédies',
  wikidata: 'Encyclopédies',
  wikimedia_commons: 'Encyclopédies',
  official: 'Sites officiels',
  atout_france: 'Atout France & administration',
  gov: 'Atout France & administration',
  tourist_office: 'Offices du tourisme',
  unesco: 'UNESCO',
  michelin: 'Guide MICHELIN',
  press: 'Presse de référence',
  other: 'Autres références',
};

const TYPE_GROUP_EN: Readonly<Record<ExternalSourceType, string>> = {
  wikipedia: 'Encyclopaedias',
  wikidata: 'Encyclopaedias',
  wikimedia_commons: 'Encyclopaedias',
  official: 'Official websites',
  atout_france: 'Atout France & administration',
  gov: 'Government',
  tourist_office: 'Tourist offices',
  unesco: 'UNESCO',
  michelin: 'MICHELIN Guide',
  press: 'Press of reference',
  other: 'Other references',
};

export function ExternalSourcesFooter({ sources, locale }: Props): ReactElement | null {
  if (sources.length === 0) return null;

  const grouping = locale === 'en' ? TYPE_GROUP_EN : TYPE_GROUP_FR;
  const groups = new Map<string, ExternalSourceData[]>();
  for (const s of sources) {
    const label = grouping[normalizeType(s.type)];
    const arr = groups.get(label) ?? [];
    arr.push(s);
    groups.set(label, arr);
  }

  // Deterministic ordering for stable output.
  const orderedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

  const heading = locale === 'en' ? 'Sources & references' : 'Sources & références';
  const intro =
    locale === 'en'
      ? 'This editorial article is based on the following authoritative sources, listed here for transparency and reader verification.'
      : "Cet article éditorial s'appuie sur les sources d'autorité ci-dessous, listées par transparence et pour permettre la vérification.";

  return (
    <section
      id="sources"
      aria-labelledby="sources-heading"
      className="border-border bg-bg/40 mt-12 rounded-lg border p-6"
    >
      <h2 id="sources-heading" className="text-fg mb-2 font-serif text-2xl font-light">
        {heading}
      </h2>
      <p className="text-fg/70 mb-5 text-sm">{intro}</p>
      <div className="space-y-5">
        {orderedGroups.map(([groupLabel, items]) => (
          <div key={groupLabel}>
            <h3 className="text-fg/80 mb-2 text-sm font-medium uppercase tracking-wide">
              {groupLabel}
            </h3>
            <ul className="space-y-1.5 text-sm">
              {items.map((s) => {
                const label =
                  locale === 'en'
                    ? s.label_en !== undefined && s.label_en.length > 0
                      ? s.label_en
                      : s.label_fr
                    : s.label_fr;
                return (
                  <li key={s.url} className="flex items-baseline gap-2">
                    <span className="text-fg/40">→</span>
                    <a
                      href={s.url}
                      rel="noopener nofollow"
                      target="_blank"
                      className="text-fg/90 break-words underline-offset-2 hover:underline"
                    >
                      {label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

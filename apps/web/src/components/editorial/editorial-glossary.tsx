import type { ReactElement } from 'react';

/**
 * Domain-glossary block — renders the JSONB `glossary` column as a
 * `<dl>` definition list (HTML semantic + accessibility friendly).
 *
 * Skill: accessibility, structured-data-schema-org (glossary maps
 * naturally to DefinedTerm schema, emitted alongside).
 */

export interface GlossaryEntryData {
  readonly term_fr: string;
  readonly term_en?: string;
  readonly definition_fr: string;
  readonly definition_en?: string;
}

interface Props {
  readonly glossary: readonly GlossaryEntryData[];
  readonly locale: 'fr' | 'en';
}

function pick(fr: string | undefined, en: string | undefined, locale: 'fr' | 'en'): string {
  if (locale === 'en') return en !== undefined && en.length > 0 ? en : (fr ?? '');
  return fr ?? '';
}

export function EditorialGlossary({ glossary, locale }: Props): ReactElement | null {
  if (glossary.length === 0) return null;
  const heading = locale === 'en' ? 'Glossary' : 'Glossaire';

  // Sort alphabetically for predictable, scan-friendly output.
  const sorted = [...glossary].sort((a, b) =>
    pick(a.term_fr, a.term_en, locale).localeCompare(pick(b.term_fr, b.term_en, locale), locale),
  );

  return (
    <section id="glossaire" aria-labelledby="glossary-heading" className="my-10">
      <h2 id="glossary-heading" className="text-fg mb-4 font-serif text-2xl font-light">
        {heading}
      </h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        {sorted.map((g) => (
          <div key={g.term_fr} className="border-border bg-bg/30 rounded-lg border p-4">
            <dt className="text-fg mb-1 font-medium">{pick(g.term_fr, g.term_en, locale)}</dt>
            <dd className="text-fg/80 text-sm leading-relaxed">
              {pick(g.definition_fr, g.definition_en, locale)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

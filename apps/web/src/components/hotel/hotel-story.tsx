import { getTranslations } from 'next-intl/server';

import type { LocalisedHotelStorySection } from '@/server/hotels/get-hotel-by-slug';

interface HotelStoryProps {
  readonly locale: 'fr' | 'en';
  readonly sections: readonly LocalisedHotelStorySection[];
  readonly heroParagraphs: readonly string[] | null;
}

/**
 * Long-form "About the property" section (CDC §2.4).
 *
 * Layout intent
 * -------------
 *   ┌─ h2: About this property
 *   │
 *   │  hero paragraph(s) — optional, drawn from the short
 *   │  `description_*` text columns and used as a 100-200 word
 *   │  introduction.
 *   │
 *   │  ┌─ aside: Table of contents (sticky on lg+, inline on mobile)
 *   │  │   • Histoire & héritage
 *   │  │   • Emplacement
 *   │  │   • …
 *   │  │
 *   │  └─ article: ordered <h3 id> sections with multi-paragraph bodies
 *
 * Why this shape?
 * ---------------
 *   - 600-1000 words spread across 5-7 sections is the sweet spot
 *     Booking / Mr & Mrs Smith hit on their flagship palace pages;
 *     it's also what Google's E-E-A-T docs reward for travel content.
 *   - In-page anchors give us LLM-quotable URLs (`#histoire`) for
 *     ground-truth retrieval and a usable TOC for screen readers.
 *   - The TOC is rendered as a `<nav aria-label>` so assistive tech
 *     can skip the body and jump to the section heading directly.
 *
 * Editorial fallback
 * ------------------
 *   - If `sections` is empty, the component renders only the hero
 *     paragraphs (current pre-Phase-10.10 behaviour).
 *   - If both `sections` is empty AND `heroParagraphs` is null, the
 *     entire block is omitted — caller-side null-check unnecessary.
 *
 * Skill: nextjs-app-router (RSC + i18n), geo-llm-optimization (TOC +
 * anchor canonicals), accessibility (semantic dl/nav/article).
 */
export async function HotelStory({
  locale,
  sections,
  heroParagraphs,
}: HotelStoryProps): Promise<React.ReactElement | null> {
  // Nothing to render: bail before reading the messages bundle.
  const hasSections = sections.length > 0;
  const hasHero = heroParagraphs !== null && heroParagraphs.length > 0;
  if (!hasSections && !hasHero) return null;

  const t = await getTranslations({ locale, namespace: 'hotelPage' });

  return (
    <section aria-labelledby="about-title" className="mb-12">
      <h2 id="about-title" className="text-fg mb-3 font-serif text-2xl">
        {t('sections.about')}
      </h2>

      {hasHero ? (
        <div className="prose text-fg/90 mb-6 max-w-prose text-base">
          {heroParagraphs.map((paragraph, idx) => (
            <p key={idx} className="mb-3 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}

      {hasSections ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
          <nav
            aria-label={t('story.tocLabel')}
            className="border-border bg-bg rounded-lg border p-4 lg:sticky lg:top-24 lg:self-start"
          >
            <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">
              {t('story.tocTitle')}
            </p>
            <ol className="flex flex-col gap-1.5 text-sm">
              {sections.map((section, idx) => (
                <li key={section.anchor}>
                  <a
                    href={`#${section.anchor}`}
                    className="text-fg/90 hover:text-fg flex gap-2 underline-offset-2 hover:underline"
                  >
                    <span className="text-muted tabular-nums" aria-hidden>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span>{section.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="prose text-fg/90 max-w-prose text-base">
            {sections.map((section) => (
              <section
                key={section.anchor}
                aria-labelledby={section.anchor}
                className="mb-8 last:mb-0"
              >
                <h3
                  id={section.anchor}
                  className="text-fg mb-3 mt-0 scroll-mt-24 font-serif text-xl"
                >
                  {section.title}
                </h3>
                {section.paragraphs.map((paragraph, idx) => (
                  <p key={idx} className="mb-3 last:mb-0">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </article>
        </div>
      ) : null}
    </section>
  );
}

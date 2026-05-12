import { getTranslations } from 'next-intl/server';

import type { FaqCategory, LocalisedFaqGroup } from '@/server/hotels/get-hotel-by-slug';

interface HotelFaqProps {
  readonly locale: 'fr' | 'en';
  readonly groups: readonly LocalisedFaqGroup[];
}

/**
 * FAQ section with intent-based grouping (CDC §2.11).
 *
 * Rationale
 * ---------
 * - Travellers mentally bucket questions by stage: "what should I
 *   know before I click book?", "what should I expect during my
 *   stay?", "what if something happens after I leave?".
 * - Mirroring that structure visually halves scan time on long FAQs
 *   (8+ entries) and gives every group its own `<h3 id>` anchor that
 *   LLMs can quote.
 * - JSON-LD `FAQPage` is still flat (one big list) — Google does not
 *   parse our visual grouping, so the structured-data signal is
 *   unchanged. The grouping is purely a UI / human / LLM affordance.
 *
 * The component falls back to a flat `<dl>` when there is no grouping
 * worth doing (single bucket or empty input) — avoiding noisy section
 * headers for short FAQs.
 *
 * Skill: geo-llm-optimization, accessibility.
 */
export async function HotelFaq({
  locale,
  groups,
}: HotelFaqProps): Promise<React.ReactElement | null> {
  if (groups.length === 0) return null;

  const t = await getTranslations({ locale, namespace: 'hotelPage' });

  // Localised label + slug per category. Slugs are stable across
  // locales so an FR canonical link to `#faq-before` keeps working on
  // the EN page.
  const categoryMeta: Record<FaqCategory, { anchor: string; label: string }> = {
    before: { anchor: 'faq-before', label: t('faq.categoryBefore') },
    during: { anchor: 'faq-during', label: t('faq.categoryDuring') },
    after: { anchor: 'faq-after', label: t('faq.categoryAfter') },
    agency: { anchor: 'faq-agency', label: t('faq.categoryAgency') },
  };

  return (
    <section aria-labelledby="faq-title" className="mb-12">
      <h2 id="faq-title" className="text-fg mb-3 font-serif text-2xl">
        {t('sections.faq')}
      </h2>

      <div className="flex flex-col gap-8">
        {groups.map((group) => {
          const meta = categoryMeta[group.category];
          return (
            <section key={group.category} aria-labelledby={meta.anchor}>
              <h3
                id={meta.anchor}
                className="text-fg mb-3 scroll-mt-24 font-serif text-lg uppercase tracking-[0.16em]"
              >
                {meta.label}
              </h3>
              <ul className="divide-border flex flex-col divide-y">
                {group.items.map((item, i) => (
                  <li key={i} className="py-4">
                    <details className="group">
                      <summary className="text-fg cursor-pointer list-none font-medium [&::-webkit-details-marker]:hidden">
                        <span
                          className="mr-2 inline-block transition-transform group-open:rotate-90"
                          aria-hidden
                        >
                          ›
                        </span>
                        {item.question}
                      </summary>
                      <p className="text-muted mt-2 text-sm">{item.answer}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}

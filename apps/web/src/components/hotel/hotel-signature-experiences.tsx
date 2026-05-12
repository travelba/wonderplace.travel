import { HotelImage } from '@cct/ui';
import { getTranslations } from 'next-intl/server';

import type { LocalisedSignatureExperience } from '@/server/hotels/get-hotel-by-slug';

interface HotelSignatureExperiencesProps {
  readonly locale: 'fr' | 'en';
  readonly cloudName: string;
  readonly experiences: readonly LocalisedSignatureExperience[];
}

/**
 * Signature experiences block — CDC §2.12.
 *
 * Surfaces a small ordered grid of **exclusive, property-bound**
 * programmes that differentiate the hotel from a generic luxury
 * stay (in-house transport fleets, dining rituals, member-only
 * programmes, residency arts, ateliers…).
 *
 * Why a dedicated block (and not just a section in the long story)?
 * -----------------------------------------------------------------
 *   - These programmes drive conversion, not narrative: travellers
 *     scan-read them. A card grid is the right scan unit; prose
 *     buries the information.
 *   - LLM ingestion: each card is a short, self-contained "thing
 *     the hotel offers", which Perplexity / SearchGPT quote as-is.
 *   - Each entry can carry a CTA in a future iteration (booking
 *     deeplink, programme schedule), which prose can't.
 *
 * Visual contract
 * ---------------
 *   - 1 col mobile → 2 col `md` → 3 col `lg`. Up to 6 cards (we
 *     cap at 6 to keep the page focused; surplus is dropped, not
 *     paginated, since the editorial input should rarely exceed 4).
 *   - Card height stays stable when descriptions vary in length:
 *     image fills a 16:10 strip, badge + footer line are pinned
 *     to the bottom via flex.
 *   - Image strip self-elides when no `imagePublicId` is provided
 *     (legacy hotels) — the card becomes text-only without
 *     reflowing the rest of the grid.
 *
 * The block self-elides when `experiences.length === 0`.
 *
 * a11y
 * ----
 *   - The section is labelled by `#signature-experiences-title`.
 *   - Each card is a `<article>` with its own `<h3>`; that lets
 *     assistive tech navigate the grid card-by-card via the H
 *     header rotor.
 *   - The badge is a `<span>` with a visible label (no icon-only
 *     conveyance).
 *
 * Skill: geo-llm-optimization, content-modeling, accessibility.
 */
const MAX_EXPERIENCES = 6;

export async function HotelSignatureExperiences({
  locale,
  cloudName,
  experiences,
}: HotelSignatureExperiencesProps): Promise<React.ReactElement | null> {
  if (experiences.length === 0) return null;

  const t = await getTranslations({ locale, namespace: 'hotelPage' });

  const visible = experiences.slice(0, MAX_EXPERIENCES);

  return (
    <section aria-labelledby="signature-experiences-title" className="mb-12">
      <h2 id="signature-experiences-title" className="text-fg mb-3 font-serif text-2xl">
        {t('sections.signatureExperiences')}
      </h2>
      <p className="text-muted mb-6 max-w-prose text-sm">{t('signatureExperiences.intro')}</p>

      <ul
        aria-label={t('signatureExperiences.listAria')}
        className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
        role="list"
      >
        {visible.map((exp) => (
          <li key={exp.key} className="flex">
            <article
              id={`experience-${exp.key}`}
              className="border-border bg-bg flex flex-1 flex-col overflow-hidden rounded-lg border"
            >
              {exp.imagePublicId !== null ? (
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  <HotelImage
                    cloudName={cloudName}
                    publicId={exp.imagePublicId}
                    alt={exp.title}
                    width={640}
                    height={400}
                    variant="card"
                    className="h-full w-full"
                  />
                </div>
              ) : null}

              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-fg mb-2 font-serif text-lg">{exp.title}</h3>
                <p className="text-fg/80 mb-4 flex-1 text-sm leading-relaxed">{exp.description}</p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                  {exp.badge !== null ? (
                    <span className="border-border text-fg/80 inline-flex items-center rounded-full border px-2 py-0.5 font-medium uppercase tracking-[0.08em]">
                      {exp.badge}
                    </span>
                  ) : null}
                  <span
                    data-booking-required={exp.bookingRequired ? 'true' : 'false'}
                    className="text-muted"
                  >
                    {exp.bookingRequired
                      ? t('signatureExperiences.bookingRequired')
                      : t('signatureExperiences.includedInStay')}
                  </span>
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

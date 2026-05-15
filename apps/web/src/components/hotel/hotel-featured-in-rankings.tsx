import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import type { HotelRankingMention } from '@/server/rankings/get-rankings-for-hotel';

interface Props {
  readonly mentions: ReadonlyArray<HotelRankingMention>;
  readonly locale: Locale;
}

const T = {
  fr: {
    title: 'Cet hôtel apparaît dans nos classements',
    subtitle:
      'Sélections éditoriales ConciergeTravel — chaque entrée renvoie au classement complet.',
    rankLabel: (n: number) => `N°${n}`,
  },
  en: {
    title: 'This hotel features in our rankings',
    subtitle: 'ConciergeTravel editorial selections — each entry links to the full ranking.',
    rankLabel: (n: number) => `#${n}`,
  },
} as const;

/**
 * Internal-link block surfaced near the bottom of the hotel detail
 * page (CDC §15 Footer fiche + plan rankings-parity-yonder WS2.5 v4).
 *
 * Renders nothing when the hotel hasn't been featured in any
 * published ranking — keeps the page clean for fresh entries.
 */
export function HotelFeaturedInRankings({ mentions, locale }: Props) {
  if (mentions.length === 0) return null;
  const t = T[locale];

  return (
    <section
      id="featured-in-rankings"
      aria-labelledby="featured-in-rankings-title"
      className="mb-10 mt-10 scroll-mt-24"
    >
      <h2 id="featured-in-rankings-title" className="text-fg mb-3 font-serif text-2xl">
        {t.title}
      </h2>
      <p className="text-muted mb-5 text-sm">{t.subtitle}</p>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {mentions.map((m) => {
          const title = locale === 'fr' ? m.titleFr : (m.titleEn ?? m.titleFr);
          const badge = locale === 'fr' ? m.badgeFr : (m.badgeEn ?? m.badgeFr);
          return (
            <li
              key={m.slug}
              className="border-border bg-bg/60 rounded-lg border p-4 transition hover:shadow-md"
            >
              <Link href={`/classement/${m.slug}`} className="flex items-baseline gap-3">
                <span className="text-fg/80 font-serif text-xl font-light">
                  {t.rankLabel(m.rank)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-fg block text-sm font-medium underline-offset-2 hover:underline">
                    {title}
                  </span>
                  {badge !== null && badge !== undefined && badge !== '' ? (
                    <span className="mt-1 inline-block rounded-full border border-amber-300/60 bg-amber-50/40 px-2 py-0.5 text-[10px] text-amber-800">
                      {badge}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

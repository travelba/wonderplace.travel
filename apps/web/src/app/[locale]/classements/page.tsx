import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { JsonLd } from '@cct/seo';

import { RankingsFacets } from '@/components/rankings/rankings-facets';
import { JsonLdScript } from '@/components/seo/json-ld';
import { LastUpdatedBadge } from '@/components/seo/last-updated-badge';
import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { env } from '@/lib/env';
import {
  listPublishedRankings,
  type PublishedRankingCard,
} from '@/server/rankings/get-ranking-by-slug';

// ADR-0007 — ISR (auth client island handles per-user UI). Mirrors
// detail page revalidation cadence.
export const revalidate = 3600;

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

function siteOrigin(): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');
}

function withLocalePrefix(locale: Locale, path: string): string {
  return locale === 'en' ? `/en${path}` : path;
}

const T = {
  fr: {
    eyebrow: 'Classements éditoriaux',
    title: 'Nos classements de Palaces et hôtels 5★',
    subtitle: (n: number) =>
      `${n} classements éditoriaux rédigés par notre équipe : les plus beaux Palaces de France, par destination, par thématique, ou par distinction.`,
    metaTitle: 'Classements de Palaces — ConciergeTravel',
    metaDesc:
      "Découvrez nos classements éditoriaux : meilleurs Palaces de France, plus beaux Palaces de Paris, Côte d'Azur, Alpes, spa, gastronomie, romantisme.",
    entriesCount: (n: number) => (n === 1 ? '1 hôtel' : `${n} hôtels`),
    seeRanking: 'Lire le classement',
    searchPlaceholder: 'Filtrer par mot-clé (ex : Paris, spa, Palace)…',
    emptyLabel: 'Aucun classement ne correspond à votre filtre.',
    clearLabel: 'Réinitialiser',
    // Template strings (no functions) so we can pass them across the
    // RSC ↔ Client Component boundary. `{n}` is interpolated client-side.
    resultsLabelTpl: '{n} résultats',
    facetType: 'Type',
    facetLieu: 'Destination',
    facetTheme: 'Thématique',
    facetOccasion: 'Occasion',
    subhubsLabel: 'Voir le sous-hub',
  },
  en: {
    eyebrow: 'Editorial rankings',
    title: 'Our Palace and 5★ hotel rankings',
    subtitle: (n: number) =>
      `${n} editorial rankings written by our team — the most beautiful Palaces of France, by destination, theme or distinction.`,
    metaTitle: 'Palace Rankings — ConciergeTravel',
    metaDesc:
      'Discover our editorial rankings: the finest Palaces of France, the most beautiful Palaces of Paris, Riviera, Alps, spa, gastronomy, romance.',
    entriesCount: (n: number) => (n === 1 ? '1 hotel' : `${n} hotels`),
    seeRanking: 'Read the ranking',
    searchPlaceholder: 'Filter by keyword (e.g. Paris, spa, Palace)…',
    emptyLabel: 'No ranking matches your filter.',
    clearLabel: 'Clear',
    resultsLabelTpl: '{n} results',
    facetType: 'Type',
    facetLieu: 'Destination',
    facetTheme: 'Theme',
    facetOccasion: 'Occasion',
    subhubsLabel: 'View sub-hub',
  },
} as const;

const TYPE_LABEL: Record<string, { fr: string; en: string }> = {
  palace: { fr: 'Palaces', en: 'Palaces' },
  '5-etoiles': { fr: '5 étoiles', en: '5 stars' },
  '4-etoiles': { fr: '4 étoiles', en: '4 stars' },
  'boutique-hotel': { fr: 'Boutique-hôtels', en: 'Boutique hotels' },
  chateau: { fr: 'Châteaux', en: 'Châteaux' },
  chalet: { fr: 'Chalets', en: 'Chalets' },
  villa: { fr: 'Villas', en: 'Villas' },
  'maison-hotes': { fr: "Maisons d'hôtes", en: 'Guesthouses' },
  resort: { fr: 'Resorts', en: 'Resorts' },
  ecolodge: { fr: 'Écolodges', en: 'Ecolodges' },
};

const THEME_LABEL: Record<string, { fr: string; en: string }> = {
  romantique: { fr: 'Romantique', en: 'Romantic' },
  famille: { fr: 'Famille', en: 'Family' },
  'spa-bienetre': { fr: 'Spa & bien-être', en: 'Spa & wellness' },
  gastronomie: { fr: 'Gastronomie', en: 'Gastronomy' },
  design: { fr: 'Design', en: 'Design' },
  patrimoine: { fr: 'Patrimoine', en: 'Heritage' },
  vignobles: { fr: 'Vignobles', en: 'Vineyards' },
  mer: { fr: 'Mer', en: 'Seaside' },
  montagne: { fr: 'Montagne', en: 'Mountain' },
  campagne: { fr: 'Campagne', en: 'Countryside' },
  urbain: { fr: 'Urbain', en: 'Urban' },
  'sport-golf': { fr: 'Golf', en: 'Golf' },
  'sport-tennis': { fr: 'Tennis', en: 'Tennis' },
  'sport-padel': { fr: 'Padel', en: 'Padel' },
  'sport-surf': { fr: 'Surf', en: 'Surf' },
  'sport-ski': { fr: 'Ski', en: 'Ski' },
  rooftop: { fr: 'Rooftop', en: 'Rooftop' },
  piscine: { fr: 'Piscine', en: 'Pool' },
  'kids-friendly': { fr: 'Kids-friendly', en: 'Kids-friendly' },
  insolite: { fr: 'Insolite', en: 'Unique' },
};

const OCCASION_LABEL: Record<string, { fr: string; en: string }> = {
  'week-end': { fr: 'Week-end', en: 'Weekend' },
  'lune-de-miel': { fr: 'Lune de miel', en: 'Honeymoon' },
  anniversaire: { fr: 'Anniversaire', en: 'Anniversary' },
  seminaire: { fr: 'Séminaire', en: 'Seminar' },
  mariage: { fr: 'Mariage', en: 'Wedding' },
  escapade: { fr: 'Escapade', en: 'Getaway' },
  staycation: { fr: 'Staycation', en: 'Staycation' },
  fetes: { fr: 'Fêtes', en: 'Holidays' },
  minceur: { fr: 'Minceur', en: 'Wellness retreat' },
};

function labelOrFallback(
  dict: Record<string, { fr: string; en: string }>,
  key: string,
  locale: Locale,
): string {
  const entry = dict[key];
  if (entry !== undefined) return entry[locale];
  return key.replace(/-/g, ' ').replace(/^\w/u, (c) => c.toUpperCase());
}

function buildFacets(
  rankings: ReadonlyArray<PublishedRankingCard>,
  locale: Locale,
  t: (typeof T)[Locale],
) {
  const counts = {
    type: new Map<string, number>(),
    lieu: new Map<string, { label: string; count: number }>(),
    theme: new Map<string, number>(),
    occasion: new Map<string, number>(),
  };

  for (const r of rankings) {
    for (const ty of r.axes.types) counts.type.set(ty, (counts.type.get(ty) ?? 0) + 1);
    for (const th of r.axes.themes) counts.theme.set(th, (counts.theme.get(th) ?? 0) + 1);
    for (const o of r.axes.occasions) counts.occasion.set(o, (counts.occasion.get(o) ?? 0) + 1);
    if (r.axes.lieu !== undefined) {
      const slug = r.axes.lieu.slug;
      const cur = counts.lieu.get(slug) ?? { label: r.axes.lieu.label, count: 0 };
      counts.lieu.set(slug, { label: cur.label, count: cur.count + 1 });
    }
  }

  return [
    {
      id: 'type' as const,
      label: t.facetType,
      options: Array.from(counts.type.entries())
        .map(([value, count]) => ({
          value,
          label: labelOrFallback(TYPE_LABEL, value, locale),
          count,
        }))
        .sort((a, b) => b.count - a.count),
    },
    {
      id: 'lieu' as const,
      label: t.facetLieu,
      options: Array.from(counts.lieu.entries())
        .map(([value, v]) => ({ value, label: v.label, count: v.count }))
        .sort((a, b) => b.count - a.count),
    },
    {
      id: 'theme' as const,
      label: t.facetTheme,
      options: Array.from(counts.theme.entries())
        .map(([value, count]) => ({
          value,
          label: labelOrFallback(THEME_LABEL, value, locale),
          count,
        }))
        .sort((a, b) => b.count - a.count),
    },
    {
      id: 'occasion' as const,
      label: t.facetOccasion,
      options: Array.from(counts.occasion.entries())
        .map(([value, count]) => ({
          value,
          label: labelOrFallback(OCCASION_LABEL, value, locale),
          count,
        }))
        .sort((a, b) => b.count - a.count),
    },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) return {};
  const t = T[raw];
  return {
    title: t.metaTitle,
    description: t.metaDesc,
    alternates: {
      canonical: raw === 'fr' ? '/classements' : '/en/classements',
      languages: {
        'fr-FR': '/classements',
        en: '/en/classements',
        'x-default': '/classements',
      },
    },
    openGraph: {
      title: t.metaTitle,
      description: t.metaDesc,
      type: 'website',
      locale: raw === 'fr' ? 'fr_FR' : 'en_US',
    },
  };
}

export default async function RankingsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);

  const t = T[locale];
  // Defensive: degrade to an empty hub when Supabase is unreachable
  // (CI prerender, transient DB outage). Skill: nextjs-app-router.
  let rankings: readonly PublishedRankingCard[];
  try {
    rankings = await listPublishedRankings();
  } catch {
    rankings = [];
  }
  const origin = siteOrigin();
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  const cards = rankings.map((r) => ({
    slug: r.slug,
    title: locale === 'fr' ? r.titleFr : (r.titleEn ?? r.titleFr),
    subtitle:
      locale === 'fr'
        ? (r.factualSummaryFr ?? null)
        : (r.factualSummaryEn ?? r.factualSummaryFr ?? null),
    entryCount: r.entryCount,
    // Pre-rendered to avoid passing a function across the RSC ↔ Client
    // Component boundary (Next.js refuses).
    entryCountLabel: t.entriesCount(r.entryCount),
    kind: r.kind,
    types: r.axes.types,
    lieuSlug: r.axes.lieu?.slug ?? null,
    lieuLabel: r.axes.lieu?.label ?? null,
    themes: r.axes.themes,
    occasions: r.axes.occasions,
  }));
  const facets = buildFacets(rankings, locale, t);

  // Latest updated_at across all rankings → drives `dateModified`
  // on the CollectionPage JSON-LD and the badge below the H1.
  const latestUpdate = rankings.reduce<string | null>((acc, r) => {
    if (r.updatedAt === null) return acc;
    if (acc === null) return r.updatedAt;
    return r.updatedAt > acc ? r.updatedAt : acc;
  }, null);

  const collectionJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.collectionPageJsonLd({
      name: t.title,
      url: `${origin}${withLocalePrefix(locale, '/classements')}`,
      description: t.metaDesc,
      ...(latestUpdate !== null ? { dateModified: latestUpdate } : {}),
      itemList: {
        name: t.title,
        items: cards.map((c) => ({
          name: c.title,
          url: `${origin}${withLocalePrefix(locale, `/classement/${c.slug}`)}`,
        })),
      },
      inLanguage: locale === 'fr' ? 'fr-FR' : 'en',
    }),
  );

  const breadcrumbJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.breadcrumbJsonLd([
      {
        name: locale === 'fr' ? 'Accueil' : 'Home',
        url: `${origin}${withLocalePrefix(locale, '/')}`,
      },
      {
        name: locale === 'fr' ? 'Classements' : 'Rankings',
        url: `${origin}${withLocalePrefix(locale, '/classements')}`,
      },
    ]),
  );

  return (
    <main className="container mx-auto max-w-7xl px-4 py-10 sm:py-14">
      <JsonLdScript data={breadcrumbJsonLd} nonce={nonce} />
      <JsonLdScript data={collectionJsonLd} nonce={nonce} />

      <header className="mb-8 max-w-3xl">
        <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">{t.eyebrow}</p>
        <h1 className="text-fg font-serif text-3xl sm:text-4xl md:text-5xl">{t.title}</h1>
        <p className="text-muted mt-3 text-sm md:text-base">{t.subtitle(rankings.length)}</p>
        <LastUpdatedBadge isoDate={latestUpdate} locale={locale} variant="inline" />
      </header>

      <RankingsFacets
        rankings={cards}
        facets={facets}
        locale={locale}
        seeRankingLabel={t.seeRanking}
        searchPlaceholder={t.searchPlaceholder}
        emptyLabel={t.emptyLabel}
        clearLabel={t.clearLabel}
        resultsLabelTpl={t.resultsLabelTpl}
        subhubsLabel={t.subhubsLabel}
      />
    </main>
  );
}

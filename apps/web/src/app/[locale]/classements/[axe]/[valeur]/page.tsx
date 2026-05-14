import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { JsonLd } from '@cct/seo';

import { JsonLdScript } from '@/components/seo/json-ld';
import { LastUpdatedBadge } from '@/components/seo/last-updated-badge';
import { Link } from '@/i18n/navigation';
import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { env } from '@/lib/env';
import { listPublishedRankings } from '@/server/rankings/get-ranking-by-slug';

export const revalidate = 3600;

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';
function siteOrigin(): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');
}
function withLocalePrefix(locale: Locale, path: string): string {
  return locale === 'en' ? `/en${path}` : path;
}

const ALLOWED_AXES = new Set(['type', 'lieu', 'theme', 'occasion'] as const);
type Axe = 'type' | 'lieu' | 'theme' | 'occasion';

function isAxe(s: string): s is Axe {
  return (ALLOWED_AXES as Set<string>).has(s);
}

const T = {
  fr: {
    home: 'Accueil',
    rankings: 'Classements',
    eyebrow: 'Sous-hub',
    metaTitleTpl: (axe: string, label: string) => `Classements ${axe} ${label} — ConciergeTravel`,
    metaDescTpl: (label: string, n: number) =>
      `${n} classements éditoriaux Palaces et 5 étoiles autour de ${label}.`,
    backLabel: '← Tous les classements',
    seeRanking: 'Lire le classement',
    entriesCount: (n: number) => (n === 1 ? '1 hôtel' : `${n} hôtels`),
    empty: "Aucun classement pour ce filtre pour l'instant.",
  },
  en: {
    home: 'Home',
    rankings: 'Rankings',
    eyebrow: 'Sub-hub',
    metaTitleTpl: (axe: string, label: string) => `${axe} rankings — ${label} — ConciergeTravel`,
    metaDescTpl: (label: string, n: number) =>
      `${n} editorial Palace and 5-star rankings around ${label}.`,
    backLabel: '← All rankings',
    seeRanking: 'Read the ranking',
    entriesCount: (n: number) => (n === 1 ? '1 hotel' : `${n} hotels`),
    empty: 'No ranking for this filter yet.',
  },
} as const;

const AXE_LABEL: Record<Axe, { fr: string; en: string }> = {
  type: { fr: 'par type', en: 'by type' },
  lieu: { fr: 'par destination', en: 'by destination' },
  theme: { fr: 'par thématique', en: 'by theme' },
  occasion: { fr: 'par occasion', en: 'by occasion' },
};

function rankingMatches(
  axe: Axe,
  value: string,
  rk: Awaited<ReturnType<typeof listPublishedRankings>>[number],
): boolean {
  switch (axe) {
    case 'type':
      return rk.axes.types.includes(value);
    case 'lieu':
      return rk.axes.lieu?.slug === value;
    case 'theme':
      return rk.axes.themes.includes(value);
    case 'occasion':
      return rk.axes.occasions.includes(value);
    default:
      return false;
  }
}

/**
 * Defensive — never throws during build (nextjs-app-router skill).
 * Enumerates every (axe × value) pair seen in the published axes
 * payloads. The result is bilingual and stable across rebuilds.
 */
export async function generateStaticParams(): Promise<
  { locale: string; axe: string; valeur: string }[]
> {
  try {
    const rankings = await listPublishedRankings();
    const seen = new Set<string>();
    const out: { locale: string; axe: string; valeur: string }[] = [];
    const push = (axe: Axe, valeur: string): void => {
      const key = `${axe}/${valeur}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ locale: 'fr', axe, valeur });
      out.push({ locale: 'en', axe, valeur });
    };
    for (const r of rankings) {
      for (const ty of r.axes.types) push('type', ty);
      for (const th of r.axes.themes) push('theme', th);
      for (const o of r.axes.occasions) push('occasion', o);
      if (r.axes.lieu !== undefined) push('lieu', r.axes.lieu.slug);
    }
    return out;
  } catch {
    return [];
  }
}

interface PageParams {
  readonly locale: string;
  readonly axe: string;
  readonly valeur: string;
}

async function resolveAxeValue(
  axe: Axe,
  valeur: string,
): Promise<{
  matches: Awaited<ReturnType<typeof listPublishedRankings>>;
  label: string;
} | null> {
  const all = await listPublishedRankings();
  const matches = all.filter((r) => rankingMatches(axe, valeur, r));
  if (matches.length === 0) return null;
  // Resolve a human label — for `lieu` we prefer the carried label;
  // for the others we synthesise from the slug.
  let label = valeur.replace(/-/g, ' ');
  if (axe === 'lieu') {
    const fromAxes = matches.find((m) => m.axes.lieu?.slug === valeur)?.axes.lieu?.label;
    if (fromAxes !== undefined) label = fromAxes;
  } else {
    label = label.replace(/^\w/u, (c) => c.toUpperCase());
  }
  return { matches, label };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale: raw, axe, valeur } = await params;
  if (!isRoutingLocale(raw)) return {};
  if (!isAxe(axe)) return {};
  const resolved = await resolveAxeValue(axe, valeur);
  if (resolved === null) return { robots: { index: false, follow: false } };
  const t = T[raw];
  const axeLabel = AXE_LABEL[axe][raw];
  const title = t.metaTitleTpl(axeLabel, resolved.label);
  const description = t.metaDescTpl(resolved.label, resolved.matches.length);
  const path = `/classements/${axe}/${valeur}`;
  return {
    title,
    description,
    alternates: {
      canonical: raw === 'fr' ? path : `/en${path}`,
      languages: {
        'fr-FR': path,
        en: `/en${path}`,
        'x-default': path,
      },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: raw === 'fr' ? 'fr_FR' : 'en_US',
    },
  };
}

export default async function RankingSubHubPage({ params }: { params: Promise<PageParams> }) {
  const { locale: raw, axe, valeur } = await params;
  if (!isRoutingLocale(raw)) notFound();
  if (!isAxe(axe)) notFound();
  const locale = raw;
  setRequestLocale(locale);

  const resolved = await resolveAxeValue(axe, valeur);
  if (resolved === null) notFound();

  const t = T[locale];
  const origin = siteOrigin();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const path = `/classements/${axe}/${valeur}`;
  const canonical = `${origin}${withLocalePrefix(locale, path)}`;
  const axeLabel = AXE_LABEL[axe][locale];
  const heading =
    locale === 'fr'
      ? `Classements ${axeLabel} : ${resolved.label}`
      : `${axeLabel.replace(/^by /u, '')} rankings: ${resolved.label}`;

  const latestUpdate = resolved.matches.reduce<string | null>((acc, r) => {
    if (r.updatedAt === null) return acc;
    if (acc === null) return r.updatedAt;
    return r.updatedAt > acc ? r.updatedAt : acc;
  }, null);

  const breadcrumbJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.breadcrumbJsonLd([
      { name: t.home, url: `${origin}${withLocalePrefix(locale, '/')}` },
      { name: t.rankings, url: `${origin}${withLocalePrefix(locale, '/classements')}` },
      { name: resolved.label, url: canonical },
    ]),
  );

  const collectionJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.collectionPageJsonLd({
      name: heading,
      url: canonical,
      description: t.metaDescTpl(resolved.label, resolved.matches.length),
      ...(latestUpdate !== null ? { dateModified: latestUpdate } : {}),
      itemList: {
        name: heading,
        items: resolved.matches.map((r) => ({
          name: locale === 'fr' ? r.titleFr : (r.titleEn ?? r.titleFr),
          url: `${origin}${withLocalePrefix(locale, `/classement/${r.slug}`)}`,
        })),
      },
      inLanguage: locale === 'fr' ? 'fr-FR' : 'en',
    }),
  );

  return (
    <main className="container mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <JsonLdScript data={breadcrumbJsonLd} nonce={nonce} />
      <JsonLdScript data={collectionJsonLd} nonce={nonce} />

      <nav aria-label="Breadcrumb" className="text-muted mb-6 text-xs">
        <Link href="/classements" className="hover:underline">
          {t.backLabel}
        </Link>
      </nav>

      <header className="mb-8 max-w-3xl">
        <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">{t.eyebrow}</p>
        <h1 className="text-fg font-serif text-3xl sm:text-4xl md:text-5xl">{heading}</h1>
        <LastUpdatedBadge isoDate={latestUpdate} locale={locale} variant="inline" />
      </header>

      {resolved.matches.length === 0 ? (
        <p className="text-muted/80 text-sm">{t.empty}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {resolved.matches.map((r) => {
            const title = locale === 'fr' ? r.titleFr : (r.titleEn ?? r.titleFr);
            const summary =
              locale === 'fr'
                ? (r.factualSummaryFr ?? null)
                : (r.factualSummaryEn ?? r.factualSummaryFr ?? null);
            return (
              <li
                key={r.slug}
                className="border-border bg-bg/60 rounded-lg border p-5 transition hover:shadow-md"
              >
                <Link href={`/classement/${r.slug}`} className="block">
                  <p className="text-muted mb-1 text-xs uppercase tracking-wide">
                    {t.entriesCount(r.entryCount)}
                    {r.axes.lieu !== undefined ? ` · ${r.axes.lieu.label}` : ''}
                  </p>
                  <h2 className="text-fg font-medium">{title}</h2>
                  {summary !== null ? (
                    <p className="text-fg/75 mt-2 line-clamp-3 text-xs">{summary}</p>
                  ) : null}
                  <p className="text-fg/70 mt-3 text-xs underline">{t.seeRanking} →</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

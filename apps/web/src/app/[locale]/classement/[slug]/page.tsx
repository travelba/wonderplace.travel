import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { JsonLd } from '@cct/seo';

import { EditorialCallout } from '@/components/editorial/editorial-callout';
import { EditorialGlossary } from '@/components/editorial/editorial-glossary';
import { EditorialTable } from '@/components/editorial/editorial-table';
import { EnrichedText } from '@/components/editorial/enriched-text';
import { ExternalSourcesFooter } from '@/components/editorial/external-sources-footer';
import { TocSidebar } from '@/components/editorial/toc-sidebar';
import { JsonLdScript } from '@/components/seo/json-ld';
import { LastUpdatedBadge } from '@/components/seo/last-updated-badge';
import { Link } from '@/i18n/navigation';
import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { env } from '@/lib/env';
import { buildEditorialLinkMap } from '@/server/editorial/build-link-map';
import {
  getRankingBySlug,
  getRankingEntries,
  listPublishedRankings,
} from '@/server/rankings/get-ranking-by-slug';

// ADR-0007 — ISR via auth client island (1 hour). Drops the
// `force-dynamic` we used while iterating, recovers Vercel CDN
// caching, and keeps freshness via `revalidateTag` from Payload.
export const revalidate = 3600;

/**
 * Defensive `[]` per nextjs-app-router skill: never throws during
 * build. Uses both fr + en locale slugs so the static slate matches
 * the public surface.
 */
export async function generateStaticParams(): Promise<{ locale: string; slug: string }[]> {
  try {
    const rankings = await listPublishedRankings();
    const out: { locale: string; slug: string }[] = [];
    for (const r of rankings) {
      out.push({ locale: 'fr', slug: r.slug });
      out.push({ locale: 'en', slug: r.slug });
    }
    return out;
  } catch {
    return [];
  }
}

const FALLBACK_SITE_URL = 'https://conciergetravel.fr';

function siteOrigin(): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL).replace(/\/$/, '');
}

function withLocalePrefix(locale: Locale, path: string): string {
  return locale === 'en' ? `/en${path}` : path;
}

const T = {
  fr: {
    home: 'Accueil',
    rankings: 'Classements',
    seePage: 'Voir la fiche',
    palace: 'Palace',
    stars: '★',
    faqTitle: 'Questions fréquentes',
    methodologyTitle: 'Notre méthodologie',
    rankingHeading: 'Le classement',
    outroHeading: 'Pour aller plus loin',
    updatedOn: (d: string) => `Classement révisé le ${d}.`,
    rankLabel: (n: number) => `N°${n}`,
    tablesTitle: 'Tableaux comparatifs',
  },
  en: {
    home: 'Home',
    rankings: 'Rankings',
    seePage: 'View the page',
    palace: 'Palace',
    stars: '★',
    faqTitle: 'Frequently asked questions',
    methodologyTitle: 'Our methodology',
    rankingHeading: 'The ranking',
    outroHeading: 'Going further',
    updatedOn: (d: string) => `Ranking reviewed on ${d}.`,
    rankLabel: (n: number) => `#${n}`,
    tablesTitle: 'Comparison tables',
  },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isRoutingLocale(raw)) return {};
  const ranking = await getRankingBySlug(slug);
  if (ranking === null) return {};
  const locale = raw;
  const title =
    locale === 'fr'
      ? (ranking.meta_title_fr ?? `${ranking.title_fr} | ConciergeTravel`)
      : (ranking.meta_title_en ?? `${ranking.title_en ?? ranking.title_fr} | ConciergeTravel`);
  const description =
    locale === 'fr'
      ? (ranking.meta_desc_fr ?? ranking.intro_fr.slice(0, 160))
      : (ranking.meta_desc_en ?? ranking.intro_en?.slice(0, 160) ?? ranking.intro_fr.slice(0, 160));
  return {
    title,
    description,
    alternates: {
      canonical: locale === 'fr' ? `/classement/${slug}` : `/en/classement/${slug}`,
      languages: {
        'fr-FR': `/classement/${slug}`,
        en: `/en/classement/${slug}`,
        'x-default': `/classement/${slug}`,
      },
    },
    openGraph: {
      title,
      description,
      type: 'article',
      locale: locale === 'fr' ? 'fr_FR' : 'en_US',
    },
  };
}

function formatRevisedDate(iso: string | null, locale: Locale): string | null {
  if (iso === null) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return iso;
  }
}

export default async function RankingPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);

  const ranking = await getRankingBySlug(slug);
  if (ranking === null) notFound();

  const t = T[locale];
  const origin = siteOrigin();
  const canonical = `${origin}${withLocalePrefix(locale, `/classement/${slug}`)}`;
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // Fetch entries + internal-link map in parallel (the latter drives
  // <EnrichedText /> auto-linking inside intro/sections/justifications).
  const [entries, linkMap] = await Promise.all([
    getRankingEntries(ranking.id),
    buildEditorialLinkMap({ excludeRankingSlug: slug }),
  ]);
  const linkMapAsMap = new Map(linkMap);

  const title = locale === 'fr' ? ranking.title_fr : (ranking.title_en ?? ranking.title_fr);
  const intro = locale === 'fr' ? ranking.intro_fr : (ranking.intro_en ?? ranking.intro_fr);
  const outro =
    locale === 'fr' ? (ranking.outro_fr ?? '') : (ranking.outro_en ?? ranking.outro_fr ?? '');
  const reviewedDate = formatRevisedDate(ranking.reviewed_at, locale);
  // CDC §2.3 — surface the AEO factual summary right under H1.
  const factualSummary =
    locale === 'fr'
      ? (ranking.factual_summary_fr ?? null)
      : (ranking.factual_summary_en ?? ranking.factual_summary_fr ?? null);

  // ── JSON-LD: BreadcrumbList ──────────────────────────────────────────────
  const breadcrumbJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.breadcrumbJsonLd([
      { name: t.home, url: `${origin}${withLocalePrefix(locale, '/')}` },
      { name: t.rankings, url: `${origin}${withLocalePrefix(locale, '/classements')}` },
      { name: title, url: canonical },
    ]),
  );

  // ── JSON-LD: Article ─────────────────────────────────────────────────────
  // Description preference order: factual_summary (AEO 130-150) → meta_desc → intro slice.
  const jsonLdDescription =
    factualSummary !== null && factualSummary.length > 0
      ? factualSummary
      : ((locale === 'fr' ? ranking.meta_desc_fr : ranking.meta_desc_en) ?? intro.slice(0, 200));
  const articleJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.articleJsonLd({
      headline: title,
      url: canonical,
      description: jsonLdDescription,
      datePublished: ranking.reviewed_at ?? new Date().toISOString().slice(0, 10),
      dateModified:
        ranking.updated_at ?? ranking.reviewed_at ?? new Date().toISOString().slice(0, 10),
      author: {
        name: ranking.author_name ?? 'ConciergeTravel Éditorial',
        ...(ranking.author_url !== null ? { url: `${origin}${ranking.author_url}` } : {}),
      },
      publisher: { name: 'ConciergeTravel', logoUrl: `${origin}/logo.png` },
      inLanguage: locale === 'fr' ? 'fr-FR' : 'en',
    }),
  );

  // ── JSON-LD: ItemList ────────────────────────────────────────────────────
  // Rich `Hotel` items so Google can render a top-list rich result.
  const itemListJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.itemListJsonLd({
      name: title,
      items: entries.map((e) => ({
        name: locale === 'fr' ? e.hotel_name : (e.hotel_name_en ?? e.hotel_name),
        url: `${origin}${withLocalePrefix(locale, `/hotel/${locale === 'en' && e.hotel_slug_en !== null ? e.hotel_slug_en : e.hotel_slug}`)}`,
        position: e.rank,
        hotel: { starRating: e.hotel_stars as 1 | 2 | 3 | 4 | 5 },
      })),
    }),
  );

  // ── JSON-LD: FAQPage ─────────────────────────────────────────────────────
  const faqItems = ranking.faq.filter((f) => {
    const q = locale === 'fr' ? f.question_fr : f.question_en;
    const a = locale === 'fr' ? f.answer_fr : f.answer_en;
    return q.length > 0 && a.length > 0;
  });
  const faqJsonLd =
    faqItems.length > 0
      ? JsonLd.withSchemaOrgContext(
          JsonLd.faqPageJsonLd(
            faqItems.map((f) => ({
              question: locale === 'fr' ? f.question_fr : f.question_en,
              answer: locale === 'fr' ? f.answer_fr : f.answer_en,
            })),
          ),
        )
      : null;

  // Group FAQ in two buckets — contextual (per-section anchor) vs global.
  const contextualFaqByAnchor = new Map<string, typeof faqItems>();
  const globalFaq: typeof faqItems = [];
  for (const f of faqItems) {
    const anchor = f.section_anchor;
    if (typeof anchor === 'string' && anchor.length > 0) {
      const arr = contextualFaqByAnchor.get(anchor) ?? [];
      arr.push(f);
      contextualFaqByAnchor.set(anchor, arr);
    } else {
      globalFaq.push(f);
    }
  }

  // First N callouts interleave inside editorial sections; remaining
  // (rare) sit at the bottom.
  const inlineCallouts = ranking.editorial_callouts.slice(
    0,
    Math.min(3, ranking.editorial_callouts.length),
  );

  return (
    <main className="container mx-auto max-w-7xl px-4 py-10 sm:py-14">
      <JsonLdScript data={breadcrumbJsonLd} nonce={nonce} />
      <JsonLdScript data={articleJsonLd} nonce={nonce} />
      <JsonLdScript data={itemListJsonLd} nonce={nonce} />
      {faqJsonLd !== null ? <JsonLdScript data={faqJsonLd} nonce={nonce} /> : null}

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-muted mb-6 text-xs">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:underline">
              {t.home}
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li>
            <Link href="/classements" className="hover:underline">
              {t.rankings}
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li className="text-fg font-medium">{title}</li>
        </ol>
      </nav>

      <div className="lg:grid lg:grid-cols-[1fr_240px] lg:gap-10">
        <div className="min-w-0 max-w-4xl">
          {/* Hero */}
          <header className="mb-10">
            <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">
              {locale === 'fr' ? 'Classement éditorial' : 'Editorial ranking'}
            </p>
            <h1 className="text-fg font-serif text-3xl sm:text-4xl md:text-5xl">{title}</h1>
            {/* CDC §2.3 — IA-ready factual summary (AEO surface). */}
            {factualSummary !== null && factualSummary.length > 0 ? (
              <p
                data-aeo="factual-summary"
                className="text-fg/85 mt-4 max-w-3xl border-l-2 border-amber-300/60 pl-4 text-sm md:text-base"
              >
                {factualSummary}
              </p>
            ) : null}
            <LastUpdatedBadge
              isoDate={ranking.updated_at ?? ranking.reviewed_at}
              locale={locale}
              variant="inline"
            />
            {/* Keep legacy "Classement révisé le …" for assistive context when distinct. */}
            {reviewedDate !== null && ranking.reviewed_at !== ranking.updated_at ? (
              <p className="text-muted/70 mt-1 text-xs">{t.updatedOn(reviewedDate)}</p>
            ) : null}
          </header>

          {/* Intro (méthodologie) — long-form, auto-linked entities */}
          <section id="introduction" className="mb-12 scroll-mt-24">
            <h2 className="text-fg mb-3 font-serif text-xl md:text-2xl">{t.methodologyTitle}</h2>
            <EnrichedText body={intro} locale={locale} linkMap={linkMapAsMap} />
          </section>

          {/* Editorial sections (criteria, history, trends, terroir, …) */}
          {ranking.editorial_sections.length > 0 ? (
            <article className="space-y-12">
              {ranking.editorial_sections.map((section, idx) => {
                const anchor = section.key.length > 0 ? section.key : `section-${idx}`;
                const sectionTitle =
                  locale === 'fr' ? section.title_fr : section.title_en || section.title_fr;
                const body = locale === 'fr' ? section.body_fr : section.body_en || section.body_fr;
                const localFaq = contextualFaqByAnchor.get(anchor) ?? [];
                const callout = inlineCallouts[idx] ?? null;
                return (
                  <section key={anchor} id={anchor} className="scroll-mt-24">
                    <h2 className="text-fg mb-4 font-serif text-2xl md:text-3xl">{sectionTitle}</h2>
                    <EnrichedText body={body} locale={locale} linkMap={linkMapAsMap} />
                    {callout !== null ? (
                      <EditorialCallout callout={callout} locale={locale} />
                    ) : null}
                    {localFaq.length > 0 ? (
                      <div className="mt-6 space-y-2">
                        <p className="text-fg/70 text-xs font-medium uppercase tracking-wide">
                          {locale === 'fr'
                            ? 'Questions sur cette section'
                            : 'Questions about this section'}
                        </p>
                        {localFaq.map((f, i) => {
                          const q = locale === 'fr' ? f.question_fr : f.question_en;
                          const a = locale === 'fr' ? f.answer_fr : f.answer_en;
                          return (
                            <details
                              key={`s-faq-${anchor}-${i}`}
                              className="border-border/70 bg-bg/40 rounded border p-3"
                            >
                              <summary className="text-fg/90 cursor-pointer text-sm font-medium">
                                {q}
                              </summary>
                              <p className="text-fg/80 mt-2 text-sm leading-relaxed">{a}</p>
                            </details>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </article>
          ) : null}

          {/* Comparison tables (v2) */}
          {ranking.tables.length > 0 ? (
            <section id="tableaux" className="mt-14 scroll-mt-24">
              <h2 className="text-fg mb-2 font-serif text-2xl md:text-3xl">{t.tablesTitle}</h2>
              {ranking.tables.map((tab) => (
                <EditorialTable key={tab.key} table={tab} locale={locale} />
              ))}
            </section>
          ) : null}

          {/* Entries (TOP X) — ordered list with editorial justifications */}
          <section id="ranking" className="mt-14 scroll-mt-24">
            <h2 className="text-fg mb-6 font-serif text-2xl md:text-3xl">{t.rankingHeading}</h2>
            <ol className="space-y-6">
              {entries.map((e) => {
                const linkSlug =
                  locale === 'en' && e.hotel_slug_en !== null ? e.hotel_slug_en : e.hotel_slug;
                const name = locale === 'fr' ? e.hotel_name : (e.hotel_name_en ?? e.hotel_name);
                const justification =
                  locale === 'fr' ? e.justification_fr : (e.justification_en ?? e.justification_fr);
                const badge = locale === 'fr' ? e.badge_fr : (e.badge_en ?? e.badge_fr);
                return (
                  <li
                    key={`${e.rank}-${e.hotel_slug}`}
                    id={`rank-${e.rank}`}
                    className="border-border bg-bg/60 scroll-mt-24 rounded-lg border p-6"
                  >
                    <div className="mb-3 flex items-baseline gap-3">
                      <span className="text-fg font-serif text-3xl font-light">
                        {t.rankLabel(e.rank)}
                      </span>
                      <h3 className="text-fg font-medium md:text-lg">
                        <Link href={`/hotel/${linkSlug}`} className="hover:underline">
                          {name}
                        </Link>
                      </h3>
                    </div>
                    <p className="text-muted mb-3 text-xs uppercase tracking-wide">
                      {e.hotel_is_palace ? t.palace : `${e.hotel_stars} ${t.stars}`}
                      {' · '}
                      {e.hotel_city}
                      {' · '}
                      {e.hotel_region}
                    </p>
                    {badge !== null && badge !== undefined && badge !== '' ? (
                      <p className="mb-3 inline-block rounded-full border border-amber-300/60 bg-amber-50/40 px-3 py-1 text-xs text-amber-800">
                        {badge}
                      </p>
                    ) : null}
                    {/* Auto-linked justification — neighbouring Palaces, cities, etc. */}
                    <EnrichedText
                      body={justification}
                      locale={locale}
                      linkMap={linkMapAsMap}
                      maxLinksPerParagraph={2}
                    />
                    <Link
                      href={`/hotel/${linkSlug}`}
                      className="text-fg/70 mt-3 inline-block text-xs underline hover:no-underline"
                    >
                      {t.seePage} →
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Glossary */}
          <EditorialGlossary glossary={ranking.glossary} locale={locale} />

          {/* Remaining callouts (rare) */}
          {ranking.editorial_callouts.length > inlineCallouts.length ? (
            <section className="my-10 space-y-4">
              {ranking.editorial_callouts.slice(inlineCallouts.length).map((c, i) => (
                <EditorialCallout key={`cb-${i}`} callout={c} locale={locale} />
              ))}
            </section>
          ) : null}

          {/* Outro */}
          {outro.length > 0 ? (
            <section id="conclusion" className="mt-14 scroll-mt-24">
              <h2 className="text-fg mb-3 font-serif text-2xl md:text-3xl">{t.outroHeading}</h2>
              <EnrichedText body={outro} locale={locale} linkMap={linkMapAsMap} />
            </section>
          ) : null}

          {/* Global FAQ */}
          {globalFaq.length > 0 ? (
            <section id="faq" className="mt-14 scroll-mt-24">
              <h2 className="text-fg mb-6 font-serif text-2xl md:text-3xl">{t.faqTitle}</h2>
              <div className="space-y-3">
                {globalFaq.map((f, i) => {
                  const q = locale === 'fr' ? f.question_fr : f.question_en;
                  const a = locale === 'fr' ? f.answer_fr : f.answer_en;
                  return (
                    <details
                      key={`g-faq-${i}`}
                      className="border-border bg-bg/60 open:bg-bg rounded-lg border p-4 marker:text-transparent"
                    >
                      <summary className="text-fg cursor-pointer font-medium">{q}</summary>
                      <p className="text-fg/90 mt-2 text-sm leading-relaxed">{a}</p>
                    </details>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* External sources (EEAT signal) */}
          <ExternalSourcesFooter sources={ranking.external_sources} locale={locale} />
        </div>

        {/* Sticky TOC sidebar (desktop only). */}
        <aside className="hidden lg:block">
          <TocSidebar anchors={ranking.toc_anchors} locale={locale} />
        </aside>
      </div>
    </main>
  );
}

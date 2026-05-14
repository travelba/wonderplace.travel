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
import { Link } from '@/i18n/navigation';
import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { env } from '@/lib/env';
import { buildEditorialLinkMap } from '@/server/editorial/build-link-map';
import { getCityKeysForGuide } from '@/server/guides/destination-mappings';
import { getGuideBySlug } from '@/server/guides/get-guide-by-slug';
import { getHotelsForDestination } from '@/server/guides/get-guide-hotels';

// Force-dynamic — CSP nonce + Supabase fetch. The route still benefits
// from Vercel's edge-cache at the CDN layer (the underlying data only
// changes on editorial publish).
export const dynamic = 'force-dynamic';

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
    guides: 'Guides',
    relatedTitle: 'Palaces de notre sélection à',
    relatedSubtitle: (n: number) =>
      n === 1
        ? `1 adresse 5★ référencée par notre conciergerie.`
        : `${n} adresses 5★ référencées par notre conciergerie.`,
    seePage: 'Voir la fiche',
    palace: 'Palace',
    stars: '★',
    highlightsTitle: 'À voir et à faire',
    faqTitle: 'Questions fréquentes',
    practicalTitle: 'Informations pratiques',
    bestTimeLabel: 'Meilleure période',
    currencyLabel: 'Devise',
    languagesLabel: 'Langues parlées',
    airportsLabel: 'Aéroports',
    stationsLabel: 'Gares',
    updatedOn: (d: string) => `Article révisé le ${d}.`,
  },
  en: {
    home: 'Home',
    guides: 'Guides',
    relatedTitle: 'Palaces from our selection in',
    relatedSubtitle: (n: number) =>
      n === 1
        ? `1 five-star address curated by our concierge desk.`
        : `${n} five-star addresses curated by our concierge desk.`,
    seePage: 'View the page',
    palace: 'Palace',
    stars: '★',
    highlightsTitle: 'What to see and do',
    faqTitle: 'Frequently asked questions',
    practicalTitle: 'Practical information',
    bestTimeLabel: 'Best time to visit',
    currencyLabel: 'Currency',
    languagesLabel: 'Languages',
    airportsLabel: 'Airports',
    stationsLabel: 'Train stations',
    updatedOn: (d: string) => `Article reviewed on ${d}.`,
  },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; citySlug: string }>;
}): Promise<Metadata> {
  const { locale: raw, citySlug } = await params;
  if (!isRoutingLocale(raw)) return {};
  const guide = await getGuideBySlug(citySlug);
  if (guide === null) return {};
  const locale = raw;
  const title =
    locale === 'fr'
      ? (guide.meta_title_fr ?? `Guide ${guide.name_fr} — Palaces & art de vivre | ConciergeTravel`)
      : (guide.meta_title_en ??
        `${guide.name_en ?? guide.name_fr} guide — Palaces & art de vivre | ConciergeTravel`);
  const description =
    locale === 'fr'
      ? (guide.meta_desc_fr ?? guide.summary_fr)
      : (guide.meta_desc_en ?? guide.summary_en ?? guide.summary_fr);
  return {
    title,
    description,
    alternates: {
      canonical: locale === 'fr' ? `/guide/${citySlug}` : `/en/guide/${citySlug}`,
      languages: {
        'fr-FR': `/guide/${citySlug}`,
        en: `/en/guide/${citySlug}`,
        'x-default': `/guide/${citySlug}`,
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

export default async function GuidePage({
  params,
}: {
  params: Promise<{ locale: string; citySlug: string }>;
}) {
  const { locale: raw, citySlug } = await params;
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);

  const guide = await getGuideBySlug(citySlug);
  if (guide === null) notFound();

  const t = T[locale];
  const origin = siteOrigin();
  const canonical = `${origin}${withLocalePrefix(locale, `/guide/${citySlug}`)}`;
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // Cross-link to Palaces in our catalog matching this destination.
  // The internal-link map is built in parallel — it drives the
  // <EnrichedText /> auto-linking inside section bodies.
  const cityKeys = getCityKeysForGuide(citySlug);
  const [palaces, linkMap] = await Promise.all([
    getHotelsForDestination(cityKeys),
    buildEditorialLinkMap({ excludeGuideSlug: citySlug }),
  ]);

  const guideName = locale === 'fr' ? guide.name_fr : (guide.name_en ?? guide.name_fr);

  // ── JSON-LD: BreadcrumbList ──────────────────────────────────────────────
  const breadcrumbJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.breadcrumbJsonLd([
      { name: t.home, url: `${origin}${withLocalePrefix(locale, '/')}` },
      { name: t.guides, url: `${origin}${withLocalePrefix(locale, '/guides')}` },
      { name: guideName, url: canonical },
    ]),
  );

  // ── JSON-LD: Article (long-read editorial) ───────────────────────────────
  const articleJsonLd = JsonLd.withSchemaOrgContext(
    JsonLd.articleJsonLd({
      headline:
        locale === 'fr'
          ? (guide.meta_title_fr ?? `Guide ${guide.name_fr}`)
          : (guide.meta_title_en ?? `${guide.name_en ?? guide.name_fr} guide`),
      url: canonical,
      description: locale === 'fr' ? guide.summary_fr : (guide.summary_en ?? guide.summary_fr),
      datePublished: guide.reviewed_at ?? new Date().toISOString().slice(0, 10),
      dateModified: guide.updated_at ?? guide.reviewed_at ?? new Date().toISOString().slice(0, 10),
      author: {
        name: guide.author_name ?? 'ConciergeTravel Éditorial',
        ...(guide.author_url !== null ? { url: `${origin}${guide.author_url}` } : {}),
      },
      publisher: {
        name: 'ConciergeTravel',
        logoUrl: `${origin}/logo.png`,
      },
      inLanguage: locale === 'fr' ? 'fr-FR' : 'en',
    }),
  );

  // ── JSON-LD: FAQPage (when the LLM produced bilingual FAQ pairs) ─────────
  const faqItems = guide.faq.filter((f) => {
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

  // ── JSON-LD: ItemList of Palaces in this destination ─────────────────────
  const itemListJsonLd =
    palaces.length > 0
      ? JsonLd.withSchemaOrgContext(
          JsonLd.itemListJsonLd({
            name:
              locale === 'fr'
                ? `Palaces et hôtels 5★ — ${guide.name_fr}`
                : `Palaces and 5★ hotels — ${guide.name_en ?? guide.name_fr}`,
            items: palaces.map((h) => ({
              name: locale === 'fr' ? h.name : (h.name_en ?? h.name),
              url: `${origin}${withLocalePrefix(locale, `/hotel/${locale === 'en' && h.slug_en !== null ? h.slug_en : h.slug}`)}`,
              hotel: { starRating: h.stars as 1 | 2 | 3 | 4 | 5 },
            })),
          }),
        )
      : null;

  const summary = locale === 'fr' ? guide.summary_fr : (guide.summary_en ?? guide.summary_fr);
  const reviewedDate = formatRevisedDate(guide.reviewed_at, locale);

  // Build a Map<string,string> for the EnrichedText component.
  const linkMapAsMap = new Map(linkMap);

  // Group FAQ in two buckets — contextual (per-section) vs global.
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

  // First few callouts go inline (interleaved with sections); the
  // rest sit at the bottom (rare in practice — 3-5 total).
  const inlineCallouts = guide.editorial_callouts.slice(
    0,
    Math.min(3, guide.editorial_callouts.length),
  );

  return (
    <main className="container mx-auto max-w-7xl px-4 py-10 sm:py-14">
      <JsonLdScript data={breadcrumbJsonLd} nonce={nonce} />
      <JsonLdScript data={articleJsonLd} nonce={nonce} />
      {faqJsonLd !== null ? <JsonLdScript data={faqJsonLd} nonce={nonce} /> : null}
      {itemListJsonLd !== null ? <JsonLdScript data={itemListJsonLd} nonce={nonce} /> : null}

      {/* Breadcrumb visible (skill: seo-technical §Breadcrumb) */}
      <nav aria-label="Breadcrumb" className="text-muted mb-6 text-xs">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:underline">
              {t.home}
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li>
            <Link href="/guides" className="hover:underline">
              {t.guides}
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li className="text-fg font-medium">{guideName}</li>
        </ol>
      </nav>

      <div className="lg:grid lg:grid-cols-[1fr_240px] lg:gap-10">
        <div className="min-w-0 max-w-4xl">
          {/* Hero */}
          <header className="mb-10">
            <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">
              {locale === 'fr' ? 'Guide voyage luxe' : 'Luxury travel guide'}
            </p>
            <h1 className="text-fg font-serif text-3xl sm:text-4xl md:text-5xl">{guideName}</h1>
            <p className="text-muted mt-4 text-base md:text-lg">{summary}</p>
            {reviewedDate !== null ? (
              <p className="text-muted/80 mt-3 text-xs">{t.updatedOn(reviewedDate)}</p>
            ) : null}
          </header>

          {/* Long-form sections — with auto-linked entities, contextual
              FAQ inside each section, and interleaved callouts. */}
          <article className="space-y-12">
            {guide.sections.map((section, idx) => {
              const anchor =
                (section.key ?? '').length > 0 ? (section.key as string) : `section-${idx}`;
              const title =
                locale === 'fr' ? section.title_fr : section.title_en || section.title_fr;
              const body = locale === 'fr' ? section.body_fr : section.body_en || section.body_fr;
              const localFaq = contextualFaqByAnchor.get(anchor) ?? [];
              // One inline callout per section in rotation, until exhausted.
              const callout = inlineCallouts[idx] ?? null;
              return (
                <section key={anchor} id={anchor} className="scroll-mt-24">
                  <h2 className="text-fg mb-4 font-serif text-2xl md:text-3xl">{title}</h2>
                  <EnrichedText body={body} locale={locale} linkMap={linkMapAsMap} />
                  {callout !== null ? <EditorialCallout callout={callout} locale={locale} /> : null}
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

          {/* Comparison tables (v2) */}
          {guide.tables.length > 0 ? (
            <section id="tableaux" className="mt-14 scroll-mt-24">
              <h2 className="text-fg mb-2 font-serif text-2xl md:text-3xl">
                {locale === 'fr' ? 'Tableaux comparatifs' : 'Comparison tables'}
              </h2>
              {guide.tables.map((tab) => (
                <EditorialTable key={tab.key} table={tab} locale={locale} />
              ))}
            </section>
          ) : null}

          {/* Glossary (v2) */}
          <EditorialGlossary glossary={guide.glossary} locale={locale} />

          {/* Remaining callouts (if more than one per section was supplied) */}
          {guide.editorial_callouts.length > inlineCallouts.length ? (
            <section className="my-10 space-y-4">
              {guide.editorial_callouts.slice(inlineCallouts.length).map((c, i) => (
                <EditorialCallout key={`cb-${i}`} callout={c} locale={locale} />
              ))}
            </section>
          ) : null}

          {/* Highlights — curated cluster of attractions */}
          {guide.highlights.length > 0 ? (
            <section id="highlights" className="mt-14 scroll-mt-24">
              <h2 className="text-fg mb-6 font-serif text-2xl md:text-3xl">{t.highlightsTitle}</h2>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {guide.highlights.map((h, i) => {
                  const name = locale === 'fr' ? h.name_fr : h.name_en || h.name_fr;
                  const desc =
                    locale === 'fr' ? h.description_fr : h.description_en || h.description_fr;
                  return (
                    <li
                      key={`${h.type}-${i}`}
                      className="border-border bg-bg/60 rounded-lg border p-4"
                    >
                      <p className="text-muted mb-1 text-xs uppercase tracking-wide">{h.type}</p>
                      <h3 className="text-fg font-medium">{name}</h3>
                      <p className="text-muted mt-2 text-sm">{desc}</p>
                      {h.url !== null && h.url !== undefined ? (
                        <a
                          href={h.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-fg/70 mt-2 inline-block text-xs underline hover:no-underline"
                        >
                          {locale === 'fr' ? 'En savoir plus →' : 'Read more →'}
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* Practical info */}
          {guide.practical_info !== null && guide.practical_info !== undefined ? (
            <section id="practical" className="mt-14 scroll-mt-24">
              <h2 className="text-fg mb-6 font-serif text-2xl md:text-3xl">{t.practicalTitle}</h2>
              <dl className="border-border bg-bg/60 grid grid-cols-1 gap-y-4 rounded-lg border p-5 md:grid-cols-2 md:gap-x-8">
                <div>
                  <dt className="text-muted text-xs uppercase tracking-wide">{t.bestTimeLabel}</dt>
                  <dd className="text-fg/90 mt-1 text-sm">
                    {locale === 'fr'
                      ? guide.practical_info.best_time_fr
                      : guide.practical_info.best_time_en || guide.practical_info.best_time_fr}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted text-xs uppercase tracking-wide">{t.currencyLabel}</dt>
                  <dd className="text-fg/90 mt-1 text-sm">{guide.practical_info.currency}</dd>
                </div>
                <div>
                  <dt className="text-muted text-xs uppercase tracking-wide">{t.languagesLabel}</dt>
                  <dd className="text-fg/90 mt-1 text-sm">
                    {locale === 'fr'
                      ? guide.practical_info.languages_fr
                      : guide.practical_info.languages_en}
                  </dd>
                </div>
                {guide.practical_info.airports.length > 0 ? (
                  <div className="md:col-span-2">
                    <dt className="text-muted text-xs uppercase tracking-wide">
                      {t.airportsLabel}
                    </dt>
                    <dd className="mt-1">
                      <ul className="text-fg/90 list-disc space-y-1 pl-5 text-sm">
                        {guide.practical_info.airports.map((a, i) => (
                          <li key={`${a.code ?? a.name}-${i}`}>
                            <span className="font-medium">{a.name}</span>
                            {a.code !== null && a.code !== undefined && a.code !== '' ? (
                              <span className="text-muted ml-1">({a.code})</span>
                            ) : null}
                            {' — '}
                            <span>
                              {locale === 'fr' ? a.distance_fr : a.distance_en || a.distance_fr}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ) : null}
                {guide.practical_info.train_stations.length > 0 ? (
                  <div className="md:col-span-2">
                    <dt className="text-muted text-xs uppercase tracking-wide">
                      {t.stationsLabel}
                    </dt>
                    <dd className="mt-1">
                      <ul className="text-fg/90 list-disc space-y-1 pl-5 text-sm">
                        {guide.practical_info.train_stations.map((s, i) => (
                          <li key={`${s.name}-${i}`}>
                            <span className="font-medium">{s.name}</span>
                            {' — '}
                            <span>{locale === 'fr' ? s.notes_fr : s.notes_en || s.notes_fr}</span>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ) : null}
              </dl>
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

          {/* Cross-link to Palaces in our catalog */}
          {palaces.length > 0 ? (
            <section id="palaces" className="mt-14 scroll-mt-24">
              <h2 className="text-fg mb-2 font-serif text-2xl md:text-3xl">
                {t.relatedTitle} {guideName}
              </h2>
              <p className="text-muted mb-6 text-sm">{t.relatedSubtitle(palaces.length)}</p>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {palaces.map((h) => {
                  const slug = locale === 'en' && h.slug_en !== null ? h.slug_en : h.slug;
                  const name = locale === 'fr' ? h.name : (h.name_en ?? h.name);
                  const desc = locale === 'fr' ? h.description_fr : h.description_en;
                  return (
                    <li
                      key={h.slug}
                      className="border-border bg-bg/60 rounded-lg border p-4 transition hover:shadow-md"
                    >
                      <Link href={`/hotel/${slug}`} className="block">
                        <p className="text-muted mb-1 text-xs uppercase tracking-wide">
                          {h.is_palace ? t.palace : `${h.stars} ${t.stars}`}
                          {' · '}
                          {h.city}
                        </p>
                        <h3 className="text-fg font-medium">{name}</h3>
                        {desc !== null && desc.length > 0 ? (
                          <p className="text-muted mt-2 line-clamp-3 text-sm">{desc}</p>
                        ) : null}
                        <p className="text-fg/70 mt-3 text-xs underline">{t.seePage} →</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* External sources (EEAT signal) */}
          <ExternalSourcesFooter sources={guide.external_sources} locale={locale} />
        </div>

        {/* Sticky TOC sidebar (desktop only). */}
        <aside className="hidden lg:block">
          <TocSidebar anchors={guide.toc_anchors} locale={locale} />
        </aside>
      </div>
    </main>
  );
}

export async function generateStaticParams(): Promise<{ citySlug: string }[]> {
  return Object.keys(
    (await import('@/server/guides/destination-mappings')).GUIDE_HOTEL_CITY_KEYS,
  ).map((slug) => ({ citySlug: slug }));
}

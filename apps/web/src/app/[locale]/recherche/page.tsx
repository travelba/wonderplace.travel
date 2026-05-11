import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { searchHotelsCatalogOnServer } from '@/lib/search/hotels-catalog';
import { isFakeOffersEnabled } from '@/server/booking/dev-fake-offer';

const HITS_PER_PAGE = 24;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) {
    return {};
  }
  const locale = raw;
  const t = await getTranslations({ locale, namespace: 'searchPage' });
  const canonical = locale === 'fr' ? '/recherche' : '/en/recherche';
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: {
      canonical,
      languages: {
        'fr-FR': '/recherche',
        en: '/en/recherche',
        'x-default': '/recherche',
      },
    },
  };
}

interface RechercheSearchParams {
  readonly q?: string;
  readonly checkIn?: string;
  readonly checkOut?: string;
  readonly adults?: string;
  readonly children?: string;
  readonly error?: string;
}

function defaultStay(): { checkIn: string; checkOut: string } {
  const now = new Date();
  const ci = new Date(now.getTime() + 30 * 86_400_000);
  const co = new Date(now.getTime() + 33 * 86_400_000);
  const fmt = (d: Date): string =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { checkIn: fmt(ci), checkOut: fmt(co) };
}

function pickIsoDate(value: string | undefined, fallback: string): string {
  return value !== undefined && ISO_DATE_RE.test(value) ? value : fallback;
}

function pickPositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function lockActionFor(locale: Locale, hotelId: string): string {
  const offerId = `TEST-OFFER-${hotelId}`;
  return locale === 'fr'
    ? `/reservation/offer/${encodeURIComponent(offerId)}/lock`
    : `/${locale}/reservation/offer/${encodeURIComponent(offerId)}/lock`;
}

export default async function RecherchePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RechercheSearchParams>;
}) {
  const [{ locale: raw }, sp] = await Promise.all([params, searchParams]);
  if (!isRoutingLocale(raw)) notFound();

  const locale = raw;
  setRequestLocale(locale);
  const t = await getTranslations('searchPage');

  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const defaults = defaultStay();
  const checkIn = pickIsoDate(sp.checkIn, defaults.checkIn);
  const checkOut = pickIsoDate(sp.checkOut, defaults.checkOut);
  const adults = Math.max(1, pickPositiveInt(sp.adults, 2));
  const children = pickPositiveInt(sp.children, 0);
  const errorKind = typeof sp.error === 'string' && sp.error.length > 0 ? sp.error : undefined;
  const fakeEnabled = isFakeOffersEnabled();

  const hits = await searchHotelsCatalogOnServer(locale, q, HITS_PER_PAGE);

  return (
    <main className="max-w-editorial container mx-auto px-4 py-12 sm:py-16">
      <header className="mb-10">
        <h1 className="text-fg font-serif text-3xl sm:text-4xl">{t('title')}</h1>
        <p className="text-muted mt-2 max-w-prose">{t('subtitle')}</p>

        <form
          method="get"
          className="border-border bg-bg mt-8 flex flex-col gap-4 rounded-lg border p-4 sm:p-5"
          role="search"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor="catalog-search-q" className="text-fg text-sm font-medium">
                {t('form.label')}
              </label>
              <input
                id="catalog-search-q"
                name="q"
                type="search"
                defaultValue={q}
                autoComplete="off"
                spellCheck={false}
                placeholder={t('form.placeholder')}
                className="border-border bg-bg text-fg ring-offset-bg focus-visible:ring-ring w-full rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
              />
            </div>
            <button
              type="submit"
              className="bg-fg text-bg focus-visible:ring-ring self-end rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
            >
              {t('form.submit')}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-fg font-medium">{t('stay.checkIn')}</span>
              <input
                type="date"
                name="checkIn"
                defaultValue={checkIn}
                className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-fg font-medium">{t('stay.checkOut')}</span>
              <input
                type="date"
                name="checkOut"
                defaultValue={checkOut}
                className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-fg font-medium">{t('stay.adults')}</span>
              <input
                type="number"
                name="adults"
                min={1}
                max={9}
                defaultValue={adults}
                className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-fg font-medium">{t('stay.children')}</span>
              <input
                type="number"
                name="children"
                min={0}
                max={9}
                defaultValue={children}
                className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
              />
            </label>
          </div>
        </form>

        {errorKind !== undefined ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
          >
            {t('errors.lockFailed', { kind: errorKind })}
          </p>
        ) : null}
      </header>

      <section aria-live="polite" aria-busy={false}>
        <p className="text-muted mb-6 text-sm">
          {hits.length === 0
            ? q.length === 0
              ? t('results.emptyPrompt')
              : t('results.noneForQuery')
            : t('results.count', { count: hits.length })}
        </p>

        {hits.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {hits.map((hit) => {
              const hotelIsUuid = UUID_RE.test(hit.objectID);
              return (
                <li key={hit.objectID}>
                  <article className="border-border bg-bg rounded-lg border p-4 sm:p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-fg font-serif text-lg">
                        <Link href={hit.url_path} className="hover:underline">
                          {hit.name}
                        </Link>
                      </h2>
                      <p className="text-muted text-xs">
                        {hit.is_palace
                          ? t('badges.palace')
                          : t('badges.stars', { count: hit.stars })}
                        {hit.city ? ` · ${hit.city}` : ''}
                        {hit.region ? ` · ${hit.region}` : ''}
                      </p>
                    </div>
                    {hit.description_excerpt.length > 0 ? (
                      <p className="text-muted mt-2 line-clamp-3 text-sm">
                        {hit.description_excerpt}
                      </p>
                    ) : null}

                    {fakeEnabled && hotelIsUuid ? (
                      <form
                        method="post"
                        action={lockActionFor(locale, hit.objectID)}
                        className="mt-4 flex flex-wrap items-center gap-3"
                      >
                        <input type="hidden" name="hotelId" value={hit.objectID} />
                        <input type="hidden" name="fake" value="1" />
                        <input type="hidden" name="checkIn" value={checkIn} />
                        <input type="hidden" name="checkOut" value={checkOut} />
                        <input type="hidden" name="adults" value={String(adults)} />
                        <input type="hidden" name="children" value={String(children)} />
                        <button
                          type="submit"
                          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                        >
                          {t('results.reserveTest')}
                        </button>
                        <span className="text-muted text-xs">{t('results.reserveTestHint')}</span>
                      </form>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </main>
  );
}

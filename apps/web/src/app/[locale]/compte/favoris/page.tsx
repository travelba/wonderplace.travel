import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { HotelImage } from '@cct/ui';

import { Link } from '@/i18n/navigation';
import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { env } from '@/lib/env';
import { getOptionalUser } from '@/server/auth/session';
import { listUserFavorites, type FavoriteListItem } from '@/server/account/list-favorites';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) return {};
  const t = await getTranslations({ locale: raw, namespace: 'account' });
  return {
    title: t('meta.favoritesTitle'),
    description: t('meta.favoritesDescription'),
    robots: { index: false, follow: false },
  };
}

function pickHotelName(hotel: FavoriteListItem['hotels'], locale: Locale): string {
  if (locale === 'en' && hotel.name_en !== null && hotel.name_en !== '') return hotel.name_en;
  return hotel.name;
}

function hotelHref(hotel: FavoriteListItem['hotels'], locale: Locale): string {
  const slug =
    locale === 'en' && hotel.slug_en !== null && hotel.slug_en !== '' ? hotel.slug_en : hotel.slug;
  return `/hotel/${slug}`;
}

function pickDescription(hotel: FavoriteListItem['hotels'], locale: Locale): string | null {
  const primary = locale === 'fr' ? hotel.description_fr : hotel.description_en;
  const fallback = locale === 'fr' ? hotel.description_en : hotel.description_fr;
  return primary ?? fallback;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);

  const user = await getOptionalUser();
  if (user === null) {
    const dest = locale === 'en' ? '/en/compte/favoris' : '/compte/favoris';
    redirect(
      `${locale === 'en' ? '/en/compte/connexion' : '/compte/connexion'}?next=${encodeURIComponent(dest)}`,
    );
  }

  const t = await getTranslations('account');
  const favorites = await listUserFavorites();
  const cloudName = env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  return (
    <main className="max-w-editorial container mx-auto px-4 py-10 sm:py-14">
      <header className="mb-8">
        <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">
          {t('favorites.eyebrow')}
        </p>
        <h1 className="text-fg font-serif text-3xl sm:text-4xl">{t('favorites.title')}</h1>
        <p className="text-muted mt-2 max-w-prose">{t('favorites.subtitle')}</p>
      </header>

      <nav aria-label={t('favorites.breadcrumb')} className="text-muted mb-6 text-sm">
        <Link href="/compte" className="hover:underline">
          {t('favorites.backToDashboard')}
        </Link>
      </nav>

      {favorites.length === 0 ? (
        <section
          className="border-border bg-bg rounded-lg border p-8 text-center"
          aria-labelledby="favorites-empty-title"
        >
          <h2 id="favorites-empty-title" className="text-fg mb-2 font-serif text-xl">
            {t('favorites.emptyTitle')}
          </h2>
          <p className="text-muted mx-auto max-w-prose text-sm">{t('favorites.emptyBody')}</p>
          <Link
            href="/recherche"
            className="bg-fg text-bg focus-visible:ring-ring mt-5 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
          >
            {t('favorites.emptyCta')}
          </Link>
        </section>
      ) : (
        <ul
          className="grid grid-cols-1 gap-5 md:grid-cols-2"
          aria-label={t('favorites.listAria', { count: favorites.length })}
        >
          {favorites.map((fav) => (
            <FavoriteCard
              key={fav.hotel_id}
              fav={fav}
              locale={locale}
              cloudName={cloudName}
              t={t}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<'account'>>>;

function FavoriteCard({
  fav,
  locale,
  cloudName,
  t,
}: {
  fav: FavoriteListItem;
  locale: Locale;
  cloudName: string;
  t: T;
}) {
  const name = pickHotelName(fav.hotels, locale);
  const href = hotelHref(fav.hotels, locale);
  const description = pickDescription(fav.hotels, locale);
  const heroPublicId = fav.hotels.hero_image;

  return (
    <li>
      <article className="border-border bg-bg group h-full overflow-hidden rounded-lg border transition-shadow hover:shadow-md">
        <Link href={href} className="block focus-visible:outline-none">
          {heroPublicId !== null ? (
            <div className="relative aspect-[4/3] w-full overflow-hidden">
              <HotelImage
                cloudName={cloudName}
                publicId={heroPublicId}
                alt={name}
                width={800}
                height={600}
                transforms="f_auto,q_auto:good,c_fill,g_auto,w_800,h_600"
              />
            </div>
          ) : (
            <div
              aria-hidden
              className="bg-muted/20 flex aspect-[4/3] w-full items-center justify-center"
            >
              <span className="text-muted text-xs uppercase tracking-[0.18em]">
                {t('favorites.noPhoto')}
              </span>
            </div>
          )}
          <div className="p-4 sm:p-5">
            <div className="text-muted flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em]">
              {fav.hotels.is_palace ? (
                <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-900">
                  {t('favorites.palace')}
                </span>
              ) : (
                <span className="border-border bg-bg rounded-md border px-2 py-0.5">
                  {t('favorites.stars', { count: fav.hotels.stars })}
                </span>
              )}
              <span>{fav.hotels.city}</span>
              <span aria-hidden>·</span>
              <span>{fav.hotels.region}</span>
            </div>
            <h2 className="text-fg mt-2 font-serif text-xl group-hover:underline">{name}</h2>
            {description !== null ? (
              <p className="text-muted mt-2 text-sm">{truncate(description, 160)}</p>
            ) : null}
          </div>
        </Link>
      </article>
    </li>
  );
}

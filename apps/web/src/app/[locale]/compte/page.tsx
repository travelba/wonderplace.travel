import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { listUserBookings, type BookingListItem } from '@/server/account/list-bookings';
import {
  listUserEmailRequests,
  type EmailRequestListItem,
} from '@/server/account/list-email-requests';
import { signOutAction } from '@/server/auth/actions';
import { getOptionalUser, pickDisplayName } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

interface DashboardSearchParams {
  readonly reset?: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isRoutingLocale(raw)) return {};
  const t = await getTranslations({ locale: raw, namespace: 'account' });
  return {
    title: t('meta.dashboardTitle'),
    description: t('meta.dashboardDescription'),
    robots: { index: false, follow: false },
  };
}

function pickHotelName(hotel: BookingListItem['hotels'], locale: Locale): string | null {
  if (hotel === null) return null;
  if (locale === 'en' && hotel.name_en !== null && hotel.name_en !== '') return hotel.name_en;
  return hotel.name;
}

function hotelHref(hotel: BookingListItem['hotels'], locale: Locale): string | null {
  if (hotel === null) return null;
  const slug =
    locale === 'en' && hotel.slug_en !== null && hotel.slug_en !== '' ? hotel.slug_en : hotel.slug;
  return `/hotel/${slug}`;
}

function fmtDate(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
    dateStyle: 'long',
  }).format(d);
}

function fmtAmount(amount: number | null, currency: string, locale: Locale): string {
  if (amount === null) return '—';
  try {
    return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}

export default async function CompteDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<DashboardSearchParams>;
}) {
  const [{ locale: raw }, sp] = await Promise.all([params, searchParams]);
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);

  const user = await getOptionalUser();
  if (user === null) {
    redirect(
      (locale === 'en' ? '/en/compte/connexion' : '/compte/connexion') +
        `?next=${encodeURIComponent(locale === 'en' ? '/en/compte' : '/compte')}`,
    );
  }

  const t = await getTranslations('account');
  const [bookings, requests] = await Promise.all([listUserBookings(), listUserEmailRequests()]);

  const displayName = pickDisplayName(user);
  const resetBanner = sp.reset === '1';
  const signOutAction_ = signOutAction;

  return (
    <main className="max-w-editorial container mx-auto px-4 py-10 sm:py-14">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted mb-2 text-xs uppercase tracking-[0.18em]">
            {t('dashboard.eyebrow')}
          </p>
          <h1 className="text-fg font-serif text-3xl sm:text-4xl">
            {t('dashboard.title', { name: displayName })}
          </h1>
          <p className="text-muted mt-2">{t('dashboard.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/compte/favoris"
            className="border-border bg-bg text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          >
            {t('dashboard.viewFavorites')}
          </Link>
          <form action={signOutAction_} method="post">
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              className="border-border bg-bg text-fg hover:bg-muted/10 focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
            >
              {t('dashboard.signOut')}
            </button>
          </form>
        </div>
      </header>

      {resetBanner ? (
        <p
          role="status"
          className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          {t('dashboard.resetBanner')}
        </p>
      ) : null}

      <section aria-labelledby="bookings-title" className="mb-12">
        <h2 id="bookings-title" className="text-fg mb-4 font-serif text-2xl">
          {t('dashboard.sections.bookings')}
        </h2>
        {bookings.length === 0 ? (
          <p className="text-muted text-sm">{t('dashboard.bookings.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {bookings.map((b) => (
              <BookingCard key={b.id} booking={b} locale={locale} t={t} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="requests-title" className="mb-12">
        <h2 id="requests-title" className="text-fg mb-4 font-serif text-2xl">
          {t('dashboard.sections.requests')}
        </h2>
        {requests.length === 0 ? (
          <p className="text-muted text-sm">{t('dashboard.requests.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {requests.map((r) => (
              <EmailRequestCard key={r.id} request={r} locale={locale} t={t} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Local card components                                                      */
/* -------------------------------------------------------------------------- */

type T = Awaited<ReturnType<typeof getTranslations<'account'>>>;

function BookingCard({ booking, locale, t }: { booking: BookingListItem; locale: Locale; t: T }) {
  const hotelName = pickHotelName(booking.hotels, locale);
  const href = hotelHref(booking.hotels, locale);
  const statusKey = `dashboard.statuses.${booking.status}` as const;
  return (
    <li>
      <article className="border-border bg-bg rounded-lg border p-4 sm:p-5">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-fg font-serif text-lg">
            {hotelName !== null && href !== null ? (
              <Link href={href} className="hover:underline">
                {hotelName}
              </Link>
            ) : (
              (hotelName ?? booking.booking_ref)
            )}
          </h3>
          <p className="text-muted text-xs">
            {t('dashboard.bookings.ref')} {booking.booking_ref}
          </p>
        </header>
        <dl className="text-muted mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-fg inline font-medium">
              {t('dashboard.bookings.stay', {
                checkIn: fmtDate(booking.checkin_date, locale),
                checkOut: fmtDate(booking.checkout_date, locale),
              })}
            </dt>
          </div>
          <div>
            {booking.nights !== null
              ? t('dashboard.bookings.nights', { count: booking.nights })
              : null}
          </div>
          <div>
            {t('dashboard.bookings.guests', {
              adults: booking.adults,
              children: booking.children,
            })}
          </div>
          <div>
            {t('dashboard.bookings.total', {
              amount: fmtAmount(booking.total_price, booking.currency, locale),
            })}
          </div>
        </dl>
        <p className="text-muted mt-2 text-xs">
          {t('dashboard.bookings.status', { value: t(statusKey) })}
        </p>
      </article>
    </li>
  );
}

function EmailRequestCard({
  request,
  locale,
  t,
}: {
  request: EmailRequestListItem;
  locale: Locale;
  t: T;
}) {
  const hotelName = pickHotelName(request.hotels, locale);
  const href = hotelHref(request.hotels, locale);
  const statusKey = `dashboard.requestStatuses.${request.status}` as const;
  return (
    <li>
      <article className="border-border bg-bg rounded-lg border p-4 sm:p-5">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-fg font-serif text-lg">
            {hotelName !== null && href !== null ? (
              <Link href={href} className="hover:underline">
                {hotelName}
              </Link>
            ) : (
              (hotelName ?? '—')
            )}
          </h3>
          {request.request_ref !== null ? (
            <p className="text-muted text-xs">
              {t('dashboard.requests.ref')} {request.request_ref}
            </p>
          ) : null}
        </header>
        <dl className="text-muted mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            {t('dashboard.requests.stay', {
              checkIn: fmtDate(request.requested_checkin, locale),
              checkOut: fmtDate(request.requested_checkout, locale),
            })}
          </div>
          <div>
            {t('dashboard.requests.submittedAt', {
              date: fmtDate(request.created_at, locale),
            })}
          </div>
        </dl>
        <p className="text-muted mt-2 text-xs">
          {t('dashboard.requests.status', { value: t(statusKey) })}
        </p>
      </article>
    </li>
  );
}

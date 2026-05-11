import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REF_PATTERN = /^CT-[0-9A-Z]{8}-[A-Z0-9]{5}$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isRoutingLocale(locale)) return { robots: { index: false, follow: false } };
  const t = await getTranslations({ locale, namespace: 'reservationConfirmation.meta' });
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false },
  };
}

interface HotelHead {
  readonly name: string;
  readonly city: string;
  readonly region: string;
}

type ConfirmationView =
  | {
      readonly kind: 'paid';
      readonly ref: string;
      readonly guestFirstname: string;
      readonly guestEmail: string;
      readonly checkIn: string;
      readonly checkOut: string;
      readonly totalAmountEur: number;
      readonly currency: string;
      readonly hotel: HotelHead | null;
    }
  | {
      readonly kind: 'email';
      readonly ref: string;
      readonly guestFirstname: string;
      readonly guestEmail: string;
      readonly checkIn: string;
      readonly checkOut: string;
      readonly hotel: HotelHead | null;
    };

const fmtPrice = (locale: Locale, amount: number, currency: string): string =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);

const isoDateOnly = (s: string): string => s.slice(0, 10);

async function fetchPaidByRef(ref: string): Promise<ConfirmationView | null> {
  let supabase;
  try {
    supabase = getSupabaseAdminClient();
  } catch {
    return null;
  }
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'booking_ref, guest_firstname, guest_email, checkin_date, checkout_date, total_price, currency, hotels:hotel_id ( name, city, region )',
    )
    .eq('booking_ref', ref)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as {
    booking_ref: string;
    guest_firstname: string;
    guest_email: string;
    checkin_date: string;
    checkout_date: string;
    total_price: string | number | null;
    currency: string;
    hotels: HotelHead | null;
  };
  const total =
    typeof row.total_price === 'string'
      ? Number.parseFloat(row.total_price)
      : (row.total_price ?? 0);
  return {
    kind: 'paid',
    ref: row.booking_ref,
    guestFirstname: row.guest_firstname,
    guestEmail: row.guest_email,
    checkIn: isoDateOnly(row.checkin_date),
    checkOut: isoDateOnly(row.checkout_date),
    totalAmountEur: Number.isFinite(total) ? total : 0,
    currency: row.currency,
    hotel: row.hotels,
  };
}

async function fetchEmailByRef(ref: string): Promise<ConfirmationView | null> {
  let supabase;
  try {
    supabase = getSupabaseAdminClient();
  } catch {
    return null;
  }
  const { data, error } = await supabase
    .from('booking_requests_email')
    .select(
      'request_ref, guest_firstname, guest_email, requested_checkin, requested_checkout, hotels:hotel_id ( name, city, region )',
    )
    .eq('request_ref', ref)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as {
    request_ref: string;
    guest_firstname: string;
    guest_email: string;
    requested_checkin: string;
    requested_checkout: string;
    hotels: HotelHead | null;
  };
  return {
    kind: 'email',
    ref: row.request_ref,
    guestFirstname: row.guest_firstname,
    guestEmail: row.guest_email,
    checkIn: isoDateOnly(row.requested_checkin),
    checkOut: isoDateOnly(row.requested_checkout),
    hotel: row.hotels,
  };
}

async function fetchView(ref: string): Promise<ConfirmationView | null> {
  const paid = await fetchPaidByRef(ref);
  if (paid !== null) return paid;
  return fetchEmailByRef(ref);
}

export default async function ReservationConfirmationPage({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}) {
  const { locale: raw, ref: rawRef } = await params;
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);
  const t = await getTranslations('reservationConfirmation');

  const ref = decodeURIComponent(rawRef ?? '');
  if (!REF_PATTERN.test(ref)) notFound();

  const view = await fetchView(ref);
  if (view === null) notFound();

  const isPaid = view.kind === 'paid';

  return (
    <main className="max-w-editorial container mx-auto px-4 py-12 sm:py-16">
      <p className="text-muted text-xs uppercase tracking-[0.18em]">
        {isPaid ? t('paid.eyebrow') : t('eyebrow')}
      </p>
      <h1 className="text-fg mt-2 font-serif text-3xl sm:text-4xl">
        {isPaid ? t('paid.title') : t('title')}
      </h1>

      <section className="border-border bg-bg mt-6 rounded-lg border p-5">
        <p className="text-fg text-sm">{t('greeting', { name: view.guestFirstname })}</p>

        {isPaid ? (
          <>
            <p className="text-muted mt-3 text-sm">
              {view.hotel !== null
                ? t('paid.summary.body', {
                    hotel: view.hotel.name,
                    checkIn: view.checkIn,
                    checkOut: view.checkOut,
                  })
                : t('paid.summary.bodyNoHotel', {
                    checkIn: view.checkIn,
                    checkOut: view.checkOut,
                  })}
            </p>
            <p className="text-fg mt-4 text-sm">
              {t('paid.totalLabel')}:{' '}
              <span className="font-medium">
                {fmtPrice(locale, view.totalAmountEur, view.currency)}
              </span>
            </p>
          </>
        ) : (
          <p className="text-muted mt-3 text-sm">
            {view.hotel !== null
              ? t('summary.body', {
                  hotel: view.hotel.name,
                  checkIn: view.checkIn,
                  checkOut: view.checkOut,
                })
              : t('summary.bodyNoHotel', {
                  checkIn: view.checkIn,
                  checkOut: view.checkOut,
                })}
          </p>
        )}

        <p className="text-fg mt-4 text-sm">
          {isPaid ? t('paid.reference.label') : t('reference.label')}:{' '}
          <span className="font-mono font-medium tracking-wider">{view.ref}</span>
        </p>
      </section>

      <p className="text-muted mt-8 text-sm">{t('emailSentTo', { email: view.guestEmail })}</p>
    </main>
  );
}

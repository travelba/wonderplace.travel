import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getFakeHotelHead } from '@/server/booking/dev-fake-hotel';
import { submitEmailBookingRequest } from '@/server/booking/email-request';
import { getOptionalUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isRoutingLocale(locale)) return { robots: { index: false, follow: false } };
  const t = await getTranslations({ locale, namespace: 'reservationStart.meta' });
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false },
  };
}

interface StartSearchParams {
  readonly hotelId?: string;
  readonly checkIn?: string;
  readonly checkOut?: string;
  readonly adults?: string;
  readonly children?: string;
  readonly error?: string;
  readonly retryAfter?: string;
  readonly scope?: string;
}

function pickString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function pickInt(v: unknown, fallback: number): number {
  if (typeof v !== 'string') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function fetchHotelHead(
  hotelId: string,
): Promise<{ id: string; name: string; city: string; region: string } | null> {
  // E2E / dev seam — short-circuit before touching Supabase. Activated
  // exclusively via the `CCT_E2E_FAKE_HOTEL_ID` env var so it cannot
  // accidentally serve fake data in production.
  const fake = getFakeHotelHead(hotelId);
  if (fake !== null) return fake;

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('hotels')
      .select('id, name, city, region, booking_mode, is_published')
      .eq('id', hotelId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      id: string;
      name: string;
      city: string;
      region: string;
      booking_mode: string;
      is_published: boolean;
    };
    // Allow both pure email-mode hotels and display-only fiches: the
    // latter (e.g. The Peninsula Paris seed) cannot be booked through
    // any GDS yet, but the concierge team still wants to receive quote
    // requests via this form. The downstream `email-request` handler
    // is mode-agnostic — it only needs a published hotel ID.
    if (
      !row.is_published ||
      (row.booking_mode !== 'email' && row.booking_mode !== 'display_only')
    ) {
      return null;
    }
    return { id: row.id, name: row.name, city: row.city, region: row.region };
  } catch (e) {
    // Degraded environments (CI smoke, preview without Supabase env) —
    // render the "unbookable" state instead of crashing the route.
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[reservation/start] fetchHotelHead failed:', e);
    }
    return null;
  }
}

function confirmationPath(locale: Locale, ref: string): string {
  return locale === 'fr'
    ? `/reservation/confirmation/${encodeURIComponent(ref)}`
    : `/${locale}/reservation/confirmation/${encodeURIComponent(ref)}`;
}

function readClientIp(forwardedFor: string | null): string | undefined {
  if (forwardedFor === null) return undefined;
  const first = forwardedFor.split(',')[0]?.trim();
  return first !== undefined && first.length > 0 && first.length <= 64 ? first : undefined;
}

async function submitAction(formData: FormData): Promise<void> {
  'use server';

  const localeRaw = formData.get('locale');
  const locale: Locale = isRoutingLocale(typeof localeRaw === 'string' ? localeRaw : undefined)
    ? (localeRaw as Locale)
    : 'fr';

  const reqHeaders = await headers();
  const clientIp = readClientIp(reqHeaders.get('x-forwarded-for'));
  const user = await getOptionalUser();

  const payload = {
    hotelId: typeof formData.get('hotelId') === 'string' ? (formData.get('hotelId') as string) : '',
    checkIn: typeof formData.get('checkIn') === 'string' ? (formData.get('checkIn') as string) : '',
    checkOut:
      typeof formData.get('checkOut') === 'string' ? (formData.get('checkOut') as string) : '',
    adults: pickInt(formData.get('adults'), 1),
    children: pickInt(formData.get('children'), 0),
    guest: {
      firstName:
        typeof formData.get('firstName') === 'string' ? (formData.get('firstName') as string) : '',
      lastName:
        typeof formData.get('lastName') === 'string' ? (formData.get('lastName') as string) : '',
      email: typeof formData.get('email') === 'string' ? (formData.get('email') as string) : '',
      phone: typeof formData.get('phone') === 'string' ? (formData.get('phone') as string) : '',
    },
    roomPreference: pickString(formData.get('roomPreference')),
    message: pickString(formData.get('message')),
    locale,
    ...(clientIp !== undefined ? { clientIp } : {}),
    ...(user !== null ? { userId: user.id } : {}),
  };

  const result = await submitEmailBookingRequest(payload);
  if (result.ok) {
    redirect(confirmationPath(locale, result.value.requestRef));
  }
  // Duplicate-within-window: route the user to the existing confirmation
  // instead of surfacing a scary error — same outcome from their POV.
  if (result.error.kind === 'duplicate') {
    redirect(confirmationPath(locale, result.error.requestRef));
  }

  const params = new URLSearchParams({
    hotelId: payload.hotelId,
    checkIn: payload.checkIn,
    checkOut: payload.checkOut,
    adults: String(payload.adults),
    children: String(payload.children),
    error: result.error.kind,
  });
  if (result.error.kind === 'rate_limited') {
    params.set('retryAfter', String(result.error.retryAfterSec));
    params.set('scope', result.error.scope);
  }
  const base = locale === 'fr' ? '/reservation/start' : `/${locale}/reservation/start`;
  redirect(`${base}?${params.toString()}`);
}

export default async function ReservationStartPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<StartSearchParams>;
}) {
  const [{ locale: raw }, sp] = await Promise.all([params, searchParams]);
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);
  const t = await getTranslations('reservationStart');

  const hotelId = pickString(sp.hotelId);
  const checkIn = pickString(sp.checkIn) ?? '';
  const checkOut = pickString(sp.checkOut) ?? '';
  const adults = pickInt(sp.adults, 2);
  const children = pickInt(sp.children, 0);
  const errorKind = pickString(sp.error);
  const retryAfter = pickInt(sp.retryAfter, 0);
  const rateScope = pickString(sp.scope);

  if (hotelId === undefined) {
    return (
      <main className="max-w-editorial container mx-auto px-4 py-12 sm:py-16">
        <h1 className="text-fg font-serif text-3xl sm:text-4xl">{t('missing.title')}</h1>
        <p className="text-muted mt-3 max-w-prose">{t('missing.description')}</p>
      </main>
    );
  }

  const hotel = await fetchHotelHead(hotelId);
  if (!hotel) {
    return (
      <main className="max-w-editorial container mx-auto px-4 py-12 sm:py-16">
        <h1 className="text-fg font-serif text-3xl sm:text-4xl">{t('unbookable.title')}</h1>
        <p className="text-muted mt-3 max-w-prose">{t('unbookable.description')}</p>
      </main>
    );
  }

  return (
    <main className="max-w-editorial container mx-auto px-4 py-12 sm:py-16">
      <header className="mb-8">
        <p className="text-muted text-xs uppercase tracking-[0.18em]">{t('eyebrow')}</p>
        <h1 className="text-fg mt-2 font-serif text-3xl sm:text-4xl">{hotel.name}</h1>
        <p className="text-muted mt-2 text-sm">
          {hotel.city} · {hotel.region}
        </p>
      </header>

      <section className="border-border bg-bg mb-8 rounded-lg border p-4 sm:p-5">
        <h2 className="text-fg font-serif text-lg">{t('summary.title')}</h2>
        <dl className="mt-3 grid grid-cols-1 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted text-xs uppercase tracking-wide">{t('summary.stay')}</dt>
            <dd className="text-fg text-sm">
              {checkIn} → {checkOut}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase tracking-wide">{t('summary.guests')}</dt>
            <dd className="text-fg text-sm">{t('summary.guestsValue', { adults, children })}</dd>
          </div>
        </dl>
      </section>

      <form action={submitAction} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="hotelId" value={hotelId} />
        <input type="hidden" name="checkIn" value={checkIn} />
        <input type="hidden" name="checkOut" value={checkOut} />
        <input type="hidden" name="adults" value={String(adults)} />
        <input type="hidden" name="children" value={String(children)} />

        <fieldset className="flex flex-col gap-4">
          <legend className="text-fg font-serif text-lg">{t('form.legend')}</legend>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-fg font-medium">{t('form.firstName')}</span>
              <input
                type="text"
                name="firstName"
                required
                autoComplete="given-name"
                maxLength={60}
                className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-fg font-medium">{t('form.lastName')}</span>
              <input
                type="text"
                name="lastName"
                required
                autoComplete="family-name"
                maxLength={60}
                className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-fg font-medium">{t('form.email')}</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                maxLength={254}
                className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-fg font-medium">{t('form.phone')}</span>
              <input
                type="tel"
                name="phone"
                required
                autoComplete="tel"
                maxLength={30}
                className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-fg font-medium">{t('form.roomPreference')}</span>
            <input
              type="text"
              name="roomPreference"
              maxLength={80}
              className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-fg font-medium">{t('form.message')}</span>
            <textarea
              name="message"
              rows={4}
              maxLength={1000}
              className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
            />
          </label>
        </fieldset>

        <p className="text-muted text-xs">{t('disclaimer')}</p>

        {errorKind !== undefined ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
          >
            {errorKind === 'validation'
              ? t('errors.validation')
              : errorKind === 'hotel_not_bookable_by_email'
                ? t('errors.hotelNotBookable')
                : errorKind === 'database'
                  ? t('errors.database')
                  : errorKind === 'rate_limited'
                    ? t('errors.rateLimited', {
                        scope: rateScope ?? 'ip',
                        minutes: Math.max(1, Math.ceil(retryAfter / 60)),
                      })
                    : t('errors.unknown')}
          </p>
        ) : null}

        <button
          type="submit"
          className="bg-fg text-bg focus-visible:ring-ring self-start rounded-md px-5 py-2.5 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
        >
          {t('form.submit')}
        </button>
      </form>
    </main>
  );
}

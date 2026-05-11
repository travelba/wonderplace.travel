import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { isRoutingLocale, type Locale } from '@/i18n/routing';
import { confirmPaymentAndCreateBooking } from '@/server/booking/confirm-payment';
import { clearDraftCookie, getDraftId } from '@/server/booking/draft-cookie';
import { loadDraft } from '@/server/booking/draft-store';
import { getPaymentProvider } from '@/server/booking/payment-provider';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isRoutingLocale(locale)) return { robots: { index: false, follow: false } };
  const t = await getTranslations({ locale, namespace: 'reservationPayment.meta' });
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false },
  };
}

const fmtPrice = (locale: Locale, amountMinor: number): string =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amountMinor / 100);

function confirmationPath(locale: Locale, ref: string): string {
  return locale === 'fr'
    ? `/reservation/confirmation/${encodeURIComponent(ref)}`
    : `/${locale}/reservation/confirmation/${encodeURIComponent(ref)}`;
}

function paymentPath(locale: Locale, errorKind?: string): string {
  const base = locale === 'fr' ? '/reservation/payment' : `/${locale}/reservation/payment`;
  return errorKind !== undefined ? `${base}?error=${encodeURIComponent(errorKind)}` : base;
}

async function confirmStubAction(): Promise<void> {
  'use server';

  const draftId = await getDraftId();
  if (draftId === undefined) {
    redirect('/');
  }

  const persisted = await loadDraft(draftId);
  if (persisted === null) {
    redirect('/');
  }

  const result = await confirmPaymentAndCreateBooking(draftId);
  if (!result.ok) {
    redirect(paymentPath(persisted.locale, result.error.kind));
  }

  await clearDraftCookie();
  redirect(confirmationPath(persisted.locale, result.value.bookingRef));
}

interface PaymentSearchParams {
  readonly error?: string;
}

export default async function ReservationPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<PaymentSearchParams>;
}) {
  const [{ locale: raw }, sp] = await Promise.all([params, searchParams]);
  if (!isRoutingLocale(raw)) notFound();
  const locale = raw;
  setRequestLocale(locale);
  const t = await getTranslations('reservationPayment');

  const draftId = await getDraftId();
  const persisted = draftId !== undefined ? await loadDraft(draftId) : null;

  if (persisted === null || persisted.draft.state !== 'payment_pending') {
    return (
      <main className="max-w-editorial container mx-auto px-4 py-12 sm:py-16">
        <h1 className="text-fg font-serif text-3xl sm:text-4xl">{t('expired.title')}</h1>
        <p className="text-muted mt-3 max-w-prose">{t('expired.description')}</p>
      </main>
    );
  }

  const offer = persisted.draft.offer;
  const provider = getPaymentProvider();
  const errorKind = typeof sp.error === 'string' && sp.error.length > 0 ? sp.error : undefined;

  return (
    <main className="max-w-editorial container mx-auto px-4 py-12 sm:py-16">
      <header className="mb-6">
        <p className="text-muted text-xs uppercase tracking-[0.18em]">{t('eyebrow')}</p>
        <h1 className="text-fg mt-2 font-serif text-3xl sm:text-4xl">{t('title')}</h1>
      </header>

      <section className="border-border bg-bg mb-8 rounded-lg border p-4 sm:p-5">
        <p className="text-fg text-sm">
          {t('summary', {
            hotel: persisted.hotel.name,
            total: offer !== undefined ? fmtPrice(locale, offer.totalPrice.amountMinor) : '—',
          })}
        </p>
      </section>

      {provider.mode === 'stub' ? (
        <section
          className="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-5"
          aria-labelledby="stub-banner"
        >
          <h2 id="stub-banner" className="font-serif text-lg text-amber-900">
            {t('stub.title')}
          </h2>
          <p className="mt-2 text-sm text-amber-900">{t('stub.description')}</p>

          <form action={confirmStubAction} className="mt-4">
            <button
              type="submit"
              className="rounded-md bg-amber-900 px-5 py-2.5 text-sm font-medium text-amber-50 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
            >
              {t('stub.confirmCta')}
            </button>
          </form>

          {errorKind !== undefined ? (
            <p
              role="alert"
              className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
            >
              {errorKind === 'payment_declined'
                ? t('errors.declined')
                : errorKind === 'booking_upstream'
                  ? t('errors.bookingUpstream')
                  : errorKind === 'database'
                    ? t('errors.database')
                    : errorKind === 'no_draft' || errorKind === 'invalid_state'
                      ? t('expired.description')
                      : t('errors.unknown')}
            </p>
          ) : null}
        </section>
      ) : (
        <section
          className="border-border bg-muted/5 mb-8 rounded-lg border border-dashed p-6"
          aria-labelledby="payment-iframe-seam"
        >
          <h2 id="payment-iframe-seam" className="text-fg font-serif text-lg">
            {t('iframe.title')}
          </h2>
          <p className="text-muted mt-2 text-sm">{t('iframe.description')}</p>
          <p className="text-muted mt-2 text-xs">{t('iframe.todo')}</p>
        </section>
      )}

      <p className="text-muted text-xs">{t('pciNote')}</p>
    </main>
  );
}

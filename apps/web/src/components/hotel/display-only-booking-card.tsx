import { getTranslations } from 'next-intl/server';

interface DisplayOnlyBookingCardProps {
  readonly locale: 'fr' | 'en';
  readonly hotelId: string;
  readonly hotelName: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly adults: number;
  readonly children: number;
}

/**
 * Concierge-only booking card (CDC §2.8 — "display_only" variant).
 *
 * The Peninsula Paris and similar palaces are not in any GDS we
 * connect to (yet). The previous behaviour was a single "request by
 * email" link to `/reservation/start`, which:
 *   - left the user with no idea what the next page would look like;
 *   - asked for a click without surfacing the SLA we offer;
 *   - lost the editorial-mode reassurance (IATA, APST, paiement).
 *
 * This card surfaces a teaser GET-form whose submit navigates to
 * `/reservation/start` with the dates + party-size already encoded
 * as query params. That preserves browser back/forward semantics and
 * allows search engines to crawl the destination page if they want
 * (no JS form post). The actual concierge request form lives on
 * `/reservation/start` so the heavy server-action / rate-limiting
 * logic stays in one place.
 *
 * Locale prefix handling
 * ----------------------
 * The action URL uses an absolute `/reservation/start` path in FR
 * and `/en/reservation/start` in EN — the locale-aware Link helper
 * doesn't work for native `<form action>` attributes, so we build
 * the string manually here.
 *
 * Skill: booking-engine, accessibility (labels + aria-describedby).
 */
export async function DisplayOnlyBookingCard({
  locale,
  hotelId,
  hotelName,
  checkIn,
  checkOut,
  adults,
  children,
}: DisplayOnlyBookingCardProps): Promise<React.ReactElement> {
  const t = await getTranslations({ locale, namespace: 'hotelPage.displayOnly' });
  const action = locale === 'en' ? '/en/reservation/start' : '/reservation/start';

  return (
    <div className="mt-5 flex flex-col gap-5">
      <div
        className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900"
        role="note"
        aria-labelledby="display-only-headline"
      >
        <p id="display-only-headline" className="font-medium">
          {t('headline')}
        </p>
        <p className="mt-1 text-sm" id="display-only-explainer">
          {t('explainer', { name: hotelName })}
        </p>
        <p className="mt-1 text-sm font-medium">{t('sla')}</p>
      </div>

      <form
        method="get"
        action={action}
        className="flex flex-col gap-4"
        aria-describedby="display-only-explainer"
      >
        <input type="hidden" name="hotelId" value={hotelId} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-fg font-medium">{t('checkIn')}</span>
            <input
              type="date"
              name="checkIn"
              defaultValue={checkIn}
              required
              className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-fg font-medium">{t('checkOut')}</span>
            <input
              type="date"
              name="checkOut"
              defaultValue={checkOut}
              required
              className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-fg font-medium">{t('adults')}</span>
            <input
              type="number"
              name="adults"
              min={1}
              max={9}
              defaultValue={adults}
              required
              className="border-border bg-bg text-fg focus-visible:ring-ring rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-fg font-medium">{t('children')}</span>
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted max-w-prose text-xs">{t('trustChip')}</p>
          <button
            type="submit"
            className="bg-fg text-bg focus-visible:ring-ring rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
          >
            {t('submit')}
          </button>
        </div>
      </form>
    </div>
  );
}

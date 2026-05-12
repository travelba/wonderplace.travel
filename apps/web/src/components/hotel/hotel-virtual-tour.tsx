import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import type { HotelVirtualTour as VirtualTourValue } from '@/server/hotels/get-hotel-by-slug';

interface HotelVirtualTourProps {
  readonly locale: 'fr' | 'en';
  readonly hotelName: string;
  readonly tour: VirtualTourValue | null;
}

/**
 * Immersive virtual / 360° tour embed for the hotel detail page —
 * CDC §2 bloc 2 polish (Phase 11.4).
 *
 * Server-rendered RSC: no client JS, no hydration cost, no LCP
 * impact (the iframe is `loading="lazy"` so the browser only
 * fetches the Matterport/Kuula chrome when the section scrolls into
 * view). The iframe is sandboxed with the smallest set of
 * permissions both providers need:
 *
 *   - `allow-scripts` — required, the tour itself is a SPA.
 *   - `allow-same-origin` — required for the providers' own
 *     cookies (preserves dolly/orbit state).
 *   - `allow-popups` + `allow-popups-to-escape-sandbox` — opens
 *     external links (provider branding, "View on Matterport") in a
 *     new tab without inheriting the sandbox.
 *   - `allow-fullscreen` — handed via the `allowFullScreen` attr.
 *
 * Sensors / WebXR for true VR headset support are explicitly NOT
 * granted — Matterport and Kuula both degrade gracefully to mouse +
 * touch when those permissions aren't present, and shipping motion
 * sensor access requires a separate Permissions-Policy review.
 *
 * Accessibility
 * -------------
 * - The `<iframe>` carries a localised, name-interpolated `title` so
 *   screen readers announce the embedded content ("Visite virtuelle
 *   de Hôtel X").
 * - A `<figcaption>` below the frame names the provider and links
 *   to the canonical URL in a new tab — gives keyboard / SR users
 *   an alternative path when the embedded SPA isn't accessible.
 * - The frame `referrerPolicy="strict-origin-when-cross-origin"`
 *   prevents leaking the full hotel URL (with query params) to the
 *   provider analytics.
 */
export async function HotelVirtualTour({
  locale,
  hotelName,
  tour,
}: HotelVirtualTourProps): Promise<ReactElement | null> {
  if (tour === null) return null;

  const t = await getTranslations({ locale, namespace: 'hotelPage.virtualTour' });
  const providerLabel = t(`provider.${tour.provider}`);

  return (
    <section aria-labelledby="virtual-tour-title" className="mb-12">
      <h2 id="virtual-tour-title" className="text-fg mb-3 font-serif text-2xl">
        {t('title')}
      </h2>
      <p className="text-muted mb-4 max-w-prose text-sm">{t('intro', { name: hotelName })}</p>

      <figure className="border-border bg-bg overflow-hidden rounded-lg border">
        <div className="relative aspect-[16/9] w-full">
          <iframe
            src={tour.url}
            title={t('iframeTitle', { name: hotelName })}
            allow="fullscreen; autoplay; encrypted-media"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
        <figcaption className="text-muted flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
          <span>{t('caption', { provider: providerLabel })}</span>
          <a
            href={tour.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg underline-offset-2 hover:underline"
          >
            {t('openExternal')}
            <span aria-hidden> ↗</span>
          </a>
        </figcaption>
      </figure>
    </section>
  );
}

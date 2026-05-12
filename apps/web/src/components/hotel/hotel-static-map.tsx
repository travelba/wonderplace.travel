import { getTranslations } from 'next-intl/server';

interface HotelStaticMapProps {
  readonly locale: 'fr' | 'en';
  readonly hotelName: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Zoom level (1–19). Defaults to 15 — neighbourhood scale. */
  readonly zoom?: number;
  /** Map width in CSS pixels. The component requests a 2× DPR tile. */
  readonly width?: number;
  /** Map height in CSS pixels. */
  readonly height?: number;
}

/**
 * Static map preview for the hotel location block — CDC §2 bloc 7.
 *
 * Renders a single Wikimedia Maps OSM tile centred on the hotel's
 * coordinates, with an inline-SVG pin overlay marking the exact
 * position. The whole component is a click-through to OpenStreetMap
 * so users can pan / zoom interactively without us shipping a JS map
 * library.
 *
 * Why Wikimedia Maps and not Mapbox / MapLibre:
 *   - Free, no API key, no signup, no PII leaving the browser.
 *   - CC BY-SA — only obligation is attribution (rendered below the
 *     map).
 *   - Operated by the Wikimedia Foundation — the same infrastructure
 *     Wikipedia uses for its mobile + desktop apps.
 *   - Static tiles compress to ~30 KB; we ship one image and zero
 *     client JS for the map itself.
 *
 * The CSP header (`apps/web/src/lib/security/csp.ts`) allows
 * `https://maps.wikimedia.org` under `img-src`.
 *
 * A11y:
 *   - The image carries a meaningful `alt` describing the hotel name
 *     and area (the textual address is already rendered above this
 *     component in `HotelLocation`).
 *   - The marker overlay is `aria-hidden` — its meaning is captured
 *     by the surrounding text.
 *   - The outer link gets an `aria-label` ("Open the location of X
 *     on OpenStreetMap") so screen reader users understand the
 *     destination.
 */
export async function HotelStaticMap({
  locale,
  hotelName,
  latitude,
  longitude,
  zoom = 15,
  width = 800,
  height = 360,
}: HotelStaticMapProps): Promise<React.ReactElement> {
  const t = await getTranslations({ locale, namespace: 'hotelPage.location' });

  // Coordinates are formatted to 5 decimal places (~1 m of precision)
  // to keep the tile URL stable across renders without leaking
  // sub-meter accuracy that isn't ours to confirm.
  const lat = latitude.toFixed(5);
  const lon = longitude.toFixed(5);
  const tileUrl = `https://maps.wikimedia.org/img/osm-intl,${zoom},${lat},${lon},${width}x${height}@2x.png`;
  const osmHref = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=${zoom}`;

  return (
    <figure className="border-border bg-bg mt-4 overflow-hidden rounded-lg border">
      <a
        href={osmHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('staticMapAria', { hotelName })}
        className="focus-visible:ring-accent relative block aspect-[20/9] w-full focus:outline-none focus-visible:ring-2"
      >
        {/*
          eslint-disable-next-line @next/next/no-img-element --
          We intentionally avoid `next/image` for Wikimedia map tiles: the
          loader would force a same-origin proxy through `/_next/image`, which
          adds 1 RTT and offers no real optimization benefit for a 1024×460
          PNG we already serve at the requested DPR. The native `<img>` keeps
          this purely client-rendered after hydration with `loading="lazy"`.
        */}
        <img
          src={tileUrl}
          alt={t('staticMapAlt', { hotelName })}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
        >
          <svg
            viewBox="0 0 24 32"
            width={28}
            height={36}
            className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
            focusable="false"
          >
            <path
              d="M12 0C5.4 0 0 5.4 0 12c0 8 12 20 12 20s12-12 12-20C24 5.4 18.6 0 12 0Z"
              fill="#0F172A"
            />
            <circle cx="12" cy="12" r="4.25" fill="#FAFAF8" />
          </svg>
        </span>
      </a>
      <figcaption className="text-muted flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[0.7rem]">
        <span>
          {t.rich('mapAttribution', {
            osm: (chunks) => (
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-fg underline"
              >
                {chunks}
              </a>
            ),
            wikimedia: (chunks) => (
              <a
                href="https://wikimediafoundation.org/wiki/Maps_Terms_of_Use"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-fg underline"
              >
                {chunks}
              </a>
            ),
          })}
        </span>
      </figcaption>
    </figure>
  );
}
